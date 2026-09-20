/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  User, 
  DatabaseConnection, 
  DatabaseColumnConfiguration, 
  DatabaseColumnRuleType, 
  RuleColumnPriority, 
  RuleAggregation,
  SemanticRowRoleConfig,
  SemanticCrossRowRule,
  TransactionTypeGroupConfig,
  TypeColumnCondition,
  ColumnValueLabelMapping,
  Team
} from '../../types';
import { api } from '../../api/client';
import { showSystemAlert } from '../common/MessageModal';
import { getUserAdminCapabilities } from '../../utils/adminCapabilities';
import { 
  ShieldCheck, Database, Table, Plus, Trash2, Edit3, Copy, 
  Play, RefreshCw, Layers, CheckCircle2, AlertTriangle, XCircle, 
  Sliders, ArrowUp, ArrowDown, Search, Filter, Eye, ChevronDown, 
  ChevronUp, Check, X, Sparkles, Hash, AlertOctagon, HelpCircle,
  GitMerge, ArrowRightLeft, Split, Tag, Lock
} from 'lucide-react';

interface Props {
  currentUser: User;
  teams?: Team[];
  databases?: DatabaseConnection[];
}

const RULE_TYPE_OPTIONS: { type: DatabaseColumnRuleType; label: string; description: string; badgeColor: string }[] = [
  {
    type: 'DUPLICATE_CHECK',
    label: 'Duplicate Check',
    description: 'Detects redundant or duplicate records across composite priority columns.',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200'
  },
  {
    type: 'GROUPING_CHECK',
    label: 'Grouping Check',
    description: 'Groups records by key columns and checks aggregate conditions (count, sum, avg) with optional Type Group leg rules.',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200'
  },
  {
    type: 'TYPE_RELATION_CHECK',
    label: 'Type-Based Leg & Group Relationship Rule',
    description: 'Classifies transactions into Type Groups using single or multiple columns (e.g. Channel & Message Type), then validates per-type expected leg counts and leg balancing/equality relationships.',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200'
  },
  {
    type: 'MULTI_ROW_SEMANTIC_CHECK',
    label: 'Multi-Row Transaction / Leg Semantics',
    description: 'Interprets multiple rows of a single transaction by column roles (e.g. Debit, Credit, Reversal, Decline, Original) and checks leg completeness, value equality, and net balancing.',
    badgeColor: 'bg-teal-100 text-teal-800 border-teal-200'
  },
  {
    type: 'UNIQUE_CONSTRAINT',
    label: 'Unique Constraint',
    description: 'Enforces strict uniqueness across one or more priority columns.',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200'
  },
  {
    type: 'COMPLETENESS_CHECK',
    label: 'Completeness Check',
    description: 'Verifies required columns are not null, undefined, or empty strings.',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200'
  },
  {
    type: 'VALUE_RANGE_CHECK',
    label: 'Value Range Check',
    description: 'Validates that numeric or date values stay within permissible bounds.',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200'
  },
  {
    type: 'PATTERN_CHECK',
    label: 'Pattern / Format Check',
    description: 'Validates column values against defined standard regex patterns.',
    badgeColor: 'bg-rose-100 text-rose-800 border-rose-200'
  },
  {
    type: 'VALUE_LABEL_CHECK',
    label: 'Value Constant Labeling & Interpretation',
    description: 'Collects unique column values and allows you to label, describe, and classify constant values (say something about the row when column equals a constant).',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200'
  }
];

// Helper to safely extract row cell value case-insensitively
function getRowCellValue(row: any, colName: string) {
  if (!row || !colName) return undefined;
  if (row[colName] !== undefined) return row[colName];
  const lower = colName.toLowerCase();
  const found = Object.keys(row).find(k => k.toLowerCase() === lower);
  if (found && row[found] !== undefined) return row[found];
  return undefined;
}

export default function DatabaseColumnConfigurationStudio({ currentUser, teams = [], databases = [] }: Props) {
  const caps = getUserAdminCapabilities(currentUser, teams);
  const canManageColumnMapping = caps.canManageColumnMapping;

  // DB & Table selection
  const [activeDbs, setActiveDbs] = useState<DatabaseConnection[]>(databases);
  const [selectedDbId, setSelectedDbId] = useState<string>('');
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [isLoadingTables, setIsLoadingTables] = useState(false);

  // Live preview data
  const [previewColumns, setPreviewColumns] = useState<Array<{ name: string; type: string }>>([]);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [previewRowCount, setPreviewRowCount] = useState<number>(0);
  const [previewSource, setPreviewSource] = useState<string>('');
  const [previewExecutionMs, setPreviewExecutionMs] = useState<number>(0);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isPreviewExpanded, setIsPreviewExpanded] = useState(true);
  const [previewSearchTerm, setPreviewSearchTerm] = useState('');

  // Column configurations
  const [configurations, setConfigurations] = useState<DatabaseColumnConfiguration[]>([]);
  const [isLoadingConfigs, setIsLoadingConfigs] = useState(false);
  const [filterRuleType, setFilterRuleType] = useState<string>('ALL');
  const [searchRuleQuery, setSearchRuleQuery] = useState<string>('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<Partial<DatabaseColumnConfiguration> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Test Results State
  const [testResult, setTestResult] = useState<{
    ruleName: string;
    verdict: 'PASS' | 'VIOLATIONS_FOUND' | 'ERROR';
    totalRows: number;
    violationCount: number;
    violations: Array<{
      rowIndex: number;
      rowData: Record<string, any>;
      reason: string;
      matchedPriorityValues: Record<string, any>;
    }>;
    passedCount?: number;
    passedRows?: Array<{
      rowIndex: number;
      rowData: Record<string, any>;
      info?: string;
      matchedPriorityValues?: Record<string, any>;
    }>;
  } | null>(null);
  const [testResultFilter, setTestResultFilter] = useState<'ALL' | 'PASSED' | 'VIOLATIONS'>('ALL');
  const [isTesting, setIsTesting] = useState(false);

  // Helper to extract table names from either array or object response
  const extractTableNames = (res: any): string[] => {
    if (Array.isArray(res)) return res.map(t => typeof t === 'string' ? t : (t.name || t.tableName || '')).filter(Boolean);
    if (res && typeof res === 'object') {
      if (Array.isArray(res.tables) && res.tables.length > 0) return res.tables;
      if (Array.isArray(res.availableTables) && res.availableTables.length > 0) return res.availableTables;
      if (Array.isArray(res.allowedTables) && res.allowedTables.length > 0) return res.allowedTables;
    }
    return [];
  };

  // Smart picker for default active database (prefers databases with tables / SQL engines over raw FTP)
  const pickBestDefaultDb = (dbs: DatabaseConnection[]): string => {
    if (!dbs || dbs.length === 0) return '';
    const withTables = dbs.find(d => d.type !== 'FTP' && ((d.availableTables && d.availableTables.length > 0) || (d.allowedTables && d.allowedTables.length > 0)));
    if (withTables) return withTables.id;
    const nonFtp = dbs.find(d => d.type !== 'FTP');
    if (nonFtp) return nonFtp.id;
    return dbs[0].id;
  };

  // Check administrative privilege
  const isAdmin = currentUser?.role === 'admin' || 
    (currentUser?.role as any) === 'system_admin' || 
    currentUser?.username?.toLowerCase() === 'admin' || 
    (currentUser?.role as string)?.toLowerCase() === 'administrator';

  // Filter databases strictly to resources the user or their team created OR allocated to their team
  const filterDbsForUser = useCallback((rawDbs: DatabaseConnection[]) => {
    if (isAdmin) return rawDbs;
    const userTeamId = currentUser?.permanentTeamId || currentUser?.teamId;
    const userTeams = (teams || []).filter(t => 
      t.memberIds?.includes(currentUser?.id) || 
      t.id === userTeamId
    );
    const allocatedDbIds = new Set<string>();
    userTeams.forEach(t => {
      (t.allowedDbIds || []).forEach(id => allocatedDbIds.add(id));
    });

    return rawDbs.filter(d => 
      d.createdByUserId === currentUser?.id ||
      (d as any).createdBy === currentUser?.username ||
      (d.teamId && userTeamId && d.teamId === userTeamId) ||
      allocatedDbIds.has(d.id)
    );
  }, [isAdmin, currentUser, teams]);

  // 1. Fetch Databases if not passed (scoped strictly to created resources)
  useEffect(() => {
    const processDbs = (rawDbs: DatabaseConnection[]) => {
      const filtered = filterDbsForUser(rawDbs);
      setActiveDbs(filtered);
      setSelectedDbId(prev => (filtered.some(d => d.id === prev) ? prev : pickBestDefaultDb(filtered)));
    };

    if (databases && databases.length > 0) {
      processDbs(databases);
    } else {
      api.getDatabases().then((res) => {
        if (Array.isArray(res) && res.length > 0) {
          processDbs(res);
        }
      }).catch(err => console.warn('Could not load databases:', err));
    }
  }, [databases, filterDbsForUser]);

  // 2. Fetch Tables when selectedDbId changes (with auto-discovery fallback)
  useEffect(() => {
    if (!selectedDbId) return;
    let isMounted = true;
    setIsLoadingTables(true);

    api.getDatabaseTables(selectedDbId)
      .then(async (res) => {
        if (!isMounted) return;
        let tableList = extractTableNames(res);

        // If no tables discovered yet, attempt live discovery
        if (tableList.length === 0) {
          try {
            const discRes = await api.discoverDatabaseTables(selectedDbId);
            const discTables = extractTableNames(discRes);
            if (discTables.length > 0) {
              tableList = discTables;
            }
          } catch (discErr) {
            console.warn('Auto-discovery fallback error:', discErr);
          }
        }

        if (!isMounted) return;
        setTables(tableList);
        setSelectedTable(prev => {
          if (tableList.includes(prev)) return prev;
          return tableList.length > 0 ? tableList[0] : '';
        });
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn('Could not load tables for db:', err);
        setTables([]);
        setSelectedTable('');
      })
      .finally(() => {
        if (isMounted) setIsLoadingTables(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedDbId]);

  // 3. Fetch Live Preview Data & Column Configurations when Table changes
  const loadTablePreview = useCallback(async (dbId: string, tbl: string) => {
    if (!dbId || !tbl) {
      setPreviewColumns([]);
      setPreviewRows([]);
      setPreviewRowCount(0);
      return;
    }
    setIsLoadingPreview(true);
    try {
      const res = await api.getTablePreviewData(dbId, tbl, 50);
      const rawCols = Array.isArray(res.columns) ? res.columns : [];
      const sampleRow = res.rows && res.rows.length > 0 ? res.rows[0] : null;

      const normalizedCols: Array<{ name: string; type: string }> = rawCols.map((c: any) => {
        if (typeof c === 'string') {
          const sampleVal = sampleRow ? (sampleRow[c] ?? sampleRow[c.toLowerCase()] ?? sampleRow[c.toUpperCase()]) : undefined;
          return { name: c, type: typeof sampleVal !== 'undefined' && sampleVal !== null ? typeof sampleVal : 'text' };
        }
        return { name: c.name || String(c), type: c.type || 'text' };
      });

      setPreviewColumns(normalizedCols);
      setPreviewRows(res.rows || []);
      setPreviewRowCount(res.rowCount || (res.rows ? res.rows.length : 0));
      setPreviewSource(res.source || 'LIVE_DATABASE');
      setPreviewExecutionMs(res.executionTimeMs || 0);
    } catch (err: any) {
      console.warn('Error fetching table preview:', err);
      // Fallback to table schema
      try {
        const cols = await api.getTableColumns(dbId, tbl);
        const colList = Array.isArray(cols) ? cols : (cols && Array.isArray((cols as any).columns) ? (cols as any).columns : []);
        setPreviewColumns(colList.map((c: any) => typeof c === 'string' ? { name: c, type: 'text' } : { name: c.name, type: c.type }));
        setPreviewRows([]);
        setPreviewRowCount(0);
        setPreviewSource('SCHEMA_FALLBACK');
      } catch {
        setPreviewColumns([]);
        setPreviewRows([]);
      }
    } finally {
      setIsLoadingPreview(false);
    }
  }, []);

  const loadConfigurations = useCallback(async (dbId?: string, tbl?: string) => {
    setIsLoadingConfigs(true);
    try {
      const configs = await api.getColumnConfigurations(dbId, tbl);
      setConfigurations(Array.isArray(configs) ? configs : []);
    } catch (err: any) {
      console.warn('Error loading column configurations:', err);
      setConfigurations([]);
    } finally {
      setIsLoadingConfigs(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDbId && selectedTable) {
      loadTablePreview(selectedDbId, selectedTable);
      loadConfigurations(selectedDbId, selectedTable);
    }
  }, [selectedDbId, selectedTable, loadTablePreview, loadConfigurations]);

  // Selected Database object
  const currentDb = useMemo(() => {
    return activeDbs.find(d => d.id === selectedDbId);
  }, [activeDbs, selectedDbId]);

  // Filtered Configurations
  const filteredConfigurations = useMemo(() => {
    return configurations.filter(cfg => {
      if (filterRuleType !== 'ALL' && cfg.ruleType !== filterRuleType) return false;
      if (searchRuleQuery.trim()) {
        const q = searchRuleQuery.toLowerCase();
        const matchName = cfg.name.toLowerCase().includes(q);
        const matchDesc = cfg.description?.toLowerCase().includes(q);
        const matchCols = cfg.columns.some(c => c.columnName.toLowerCase().includes(q));
        if (!matchName && !matchDesc && !matchCols) return false;
      }
      return true;
    });
  }, [configurations, filterRuleType, searchRuleQuery]);

  // Filtered Preview Rows
  const filteredPreviewRows = useMemo(() => {
    if (!previewSearchTerm.trim()) return previewRows;
    const q = previewSearchTerm.toLowerCase();
    return previewRows.filter(row => {
      return Object.values(row).some(val => 
        val !== null && val !== undefined && String(val).toLowerCase().includes(q)
      );
    });
  }, [previewRows, previewSearchTerm]);

  // Distinct values discovered in sample data for the selected role column
  const discoveredRoleColumnValues = useMemo(() => {
    if (!editingConfig || !editingConfig.roleColumn || previewRows.length === 0) return [];
    const vals = new Set<string>();
    previewRows.forEach(r => {
      const v = getRowCellValue(r, editingConfig.roleColumn!);
      if (v !== null && v !== undefined && String(v).trim() !== '') {
        vals.add(String(v).trim());
      }
    });
    return Array.from(vals);
  }, [editingConfig?.roleColumn, previewRows]);

  // Helper to discover distinct sample values for any arbitrary column
  const getDiscoveredColumnValues = useCallback((colName: string): string[] => {
    if (!colName || previewRows.length === 0) return [];
    const vals = new Set<string>();
    previewRows.forEach(r => {
      const v = getRowCellValue(r, colName);
      if (v !== null && v !== undefined && String(v).trim() !== '') {
        vals.add(String(v).trim());
      }
    });
    return Array.from(vals).slice(0, 15);
  }, [previewRows]);

  // Helper to collect all unique distinct values from sample rows for a column
  const collectUniqueColumnValues = useCallback((colName: string): string[] => {
    if (!colName || previewRows.length === 0) return [];
    const vals = new Set<string>();
    previewRows.forEach(r => {
      const v = getRowCellValue(r, colName);
      if (v !== null && v !== undefined && String(v).trim() !== '') {
        vals.add(String(v).trim());
      }
    });
    return Array.from(vals).sort();
  }, [previewRows]);

  // Handlers for Configurations
  const handleOpenCreateModal = (prefillColumn?: string) => {
    if (!canManageColumnMapping) {
      showSystemAlert({
        type: 'warning',
        title: 'Operational Governance Restriction',
        message: 'Column configuration and mapping is restricted to Operational Teams. Database/Infrastructure teams cannot modify column rules.'
      });
      return;
    }
    const defaultCols: RuleColumnPriority[] = [];
    if (prefillColumn) {
      defaultCols.push({
        columnName: prefillColumn,
        priority: 1,
        role: 'MATCH_KEY',
        matchMode: 'EXACT',
        transform: 'NONE'
      });
    } else if (previewColumns.length > 0) {
      defaultCols.push({
        columnName: previewColumns[0].name,
        priority: 1,
        role: 'MATCH_KEY',
        matchMode: 'EXACT',
        transform: 'NONE'
      });
    }

    setEditingConfig({
      name: prefillColumn ? `Check on ${prefillColumn}` : 'New Column Rule',
      dbId: selectedDbId,
      dbName: currentDb?.name || 'Selected Database',
      tableName: selectedTable,
      ruleType: 'DUPLICATE_CHECK',
      description: 'Automated column validation rule',
      columns: defaultCols,
      groupByColumns: [],
      aggregationRules: [{ function: 'COUNT', operator: '>', value: 1 }],
      primaryKeyColumn: previewColumns.length > 0 ? previewColumns[0].name : '',
      roleColumn: previewColumns.length > 1 ? previewColumns[1].name : '',
      semanticRoles: [
        { roleName: 'Debit', matchValues: ['DR', 'DEBIT', '01'], color: 'amber' },
        { roleName: 'Credit', matchValues: ['CR', 'CREDIT', '02'], color: 'emerald' }
      ],
      crossRowRules: [
        {
          id: `crr-${Date.now()}`,
          ruleType: 'ROLE_EXISTENCE',
          primaryRole: 'Debit',
          targetRole: 'Credit',
          description: 'Debit leg must have a corresponding Credit leg'
        }
      ],
      typeGroups: [],
      valueLabels: [],
      unmappedValueAction: 'FLAG',
      violationAction: 'FLAG',
      severity: 'CRITICAL',
      violationMessage: 'Duplicate or conflicting values detected across priority columns',
      isActive: true
    });
    setIsModalOpen(true);
  };

  const handleEditConfig = (cfg: DatabaseColumnConfiguration) => {
    if (!canManageColumnMapping) {
      showSystemAlert({
        type: 'warning',
        title: 'Operational Governance Restriction',
        message: 'Column configuration and mapping is restricted to Operational Teams.'
      });
      return;
    }
    setEditingConfig({ ...cfg });
    setIsModalOpen(true);
  };

  const handleCloneConfig = (cfg: DatabaseColumnConfiguration) => {
    if (!canManageColumnMapping) {
      showSystemAlert({
        type: 'warning',
        title: 'Operational Governance Restriction',
        message: 'Column configuration and mapping is restricted to Operational Teams.'
      });
      return;
    }
    setEditingConfig({
      ...cfg,
      id: undefined,
      name: `${cfg.name} (Copy)`
    });
    setIsModalOpen(true);
  };

  const handleDeleteConfig = async (id: string, name: string) => {
    if (!canManageColumnMapping) {
      showSystemAlert({
        type: 'warning',
        title: 'Operational Governance Restriction',
        message: 'Column configuration and mapping is restricted to Operational Teams.'
      });
      return;
    }
    showSystemAlert({
      type: 'confirm',
      title: 'Delete Column Configuration',
      message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
      confirmLabel: 'Delete Rule',
      onConfirm: async () => {
        try {
          await api.deleteColumnConfiguration(id);
          setConfigurations(prev => prev.filter(c => c.id !== id));
          showSystemAlert({
            type: 'success',
            title: 'Rule Deleted',
            message: `Configuration "${name}" has been removed.`
          });
        } catch (err: any) {
          showSystemAlert({
            type: 'error',
            title: 'Delete Failed',
            message: err.message || 'Could not delete configuration'
          });
        }
      }
    });
  };

  const handleToggleActive = async (cfg: DatabaseColumnConfiguration) => {
    const updatedStatus = !cfg.isActive;
    try {
      await api.updateColumnConfiguration(cfg.id, { isActive: updatedStatus });
      setConfigurations(prev => prev.map(c => c.id === cfg.id ? { ...c, isActive: updatedStatus } : c));
    } catch (err: any) {
      showSystemAlert({
        type: 'error',
        title: 'Status Update Failed',
        message: err.message
      });
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConfig) return;

    if (!canManageColumnMapping) {
      showSystemAlert({
        type: 'warning',
        title: 'Operational Governance Restriction',
        message: 'Column configuration and mapping is restricted to Operational Teams. Database/Infrastructure teams cannot modify column rules.'
      });
      return;
    }

    if (!editingConfig.name?.trim()) {
      showSystemAlert({ type: 'warning', title: 'Validation Warning', message: 'Please provide a Rule Name.' });
      return;
    }

    if (editingConfig.ruleType === 'MULTI_ROW_SEMANTIC_CHECK' || editingConfig.ruleType === 'TYPE_RELATION_CHECK') {
      if (!editingConfig.primaryKeyColumn) {
        showSystemAlert({ type: 'warning', title: 'Validation Warning', message: 'Please select a Primary Correlation Key Column.' });
        return;
      }
      if (editingConfig.ruleType === 'MULTI_ROW_SEMANTIC_CHECK' && !editingConfig.roleColumn) {
        showSystemAlert({ type: 'warning', title: 'Validation Warning', message: 'Please select a Row Meaning / Role Column.' });
        return;
      }

      // Collect all condition columns into typeGroupColumns
      const tgCols = new Set<string>();
      (editingConfig.typeGroups || []).forEach(tg => {
        (tg.conditions || []).forEach(c => {
          if (c.columnName) tgCols.add(c.columnName);
        });
      });
      editingConfig.typeGroupColumns = Array.from(tgCols);

      // Auto-assign columns if empty
      if (!editingConfig.columns || editingConfig.columns.length === 0) {
        const cols: RuleColumnPriority[] = [
          { columnName: editingConfig.primaryKeyColumn, priority: 1, role: 'MATCH_KEY' }
        ];
        if (editingConfig.roleColumn) {
          cols.push({ columnName: editingConfig.roleColumn, priority: 2, role: 'DISCRIMINATOR' });
        }
        editingConfig.typeGroupColumns.forEach(c => {
          if (!cols.some(x => x.columnName === c)) {
            cols.push({ columnName: c, priority: cols.length + 1, role: 'DISCRIMINATOR' });
          }
        });
        editingConfig.columns = cols;
      }
    } else {
      // For GROUPING_CHECK, extract any typeGroupColumns as well
      if (editingConfig.ruleType === 'GROUPING_CHECK' && editingConfig.typeGroups) {
        const tgCols = new Set<string>();
        editingConfig.typeGroups.forEach(tg => {
          (tg.conditions || []).forEach(c => {
            if (c.columnName) tgCols.add(c.columnName);
          });
        });
        editingConfig.typeGroupColumns = Array.from(tgCols);
      }

      if (editingConfig.ruleType === 'VALUE_LABEL_CHECK') {
        const targetCol = editingConfig.primaryKeyColumn || editingConfig.columns?.[0]?.columnName;
        if (!targetCol) {
          showSystemAlert({ type: 'warning', title: 'Validation Warning', message: 'Please select an evaluation column for Value Labeling.' });
          return;
        }
        if (!editingConfig.columns || editingConfig.columns.length === 0) {
          editingConfig.columns = [{ columnName: targetCol, priority: 1, role: 'DISCRIMINATOR' }];
        }
        if (!editingConfig.valueLabels || editingConfig.valueLabels.length === 0) {
          showSystemAlert({ type: 'warning', title: 'Validation Warning', message: 'Please define or scan at least one Value Label mapping.' });
          return;
        }
      } else if (editingConfig.ruleType === 'DUPLICATE_CHECK' || editingConfig.ruleType === 'UNIQUE_CONSTRAINT') {
        if (!editingConfig.columns || editingConfig.columns.length === 0) {
          showSystemAlert({
            type: 'warning',
            title: 'Column Required',
            message: 'In Duplicate Check, at least one column must be selected to check for value or count.'
          });
          return;
        }
      } else if (!editingConfig.columns || editingConfig.columns.length === 0) {
        showSystemAlert({ type: 'warning', title: 'Validation Warning', message: 'At least one priority column must be configured.' });
        return;
      }
    }

    setIsSaving(true);
    try {
      const payload: any = {
        ...editingConfig,
        createdBy: editingConfig.createdBy || currentUser?.username || 'operator',
        createdByUserId: currentUser?.id,
        userRole: currentUser?.role,
        teamId: currentUser?.permanentTeamId || currentUser?.teamId
      };

      if (editingConfig.id) {
        const updated = await api.updateColumnConfiguration(editingConfig.id, payload);
        setConfigurations(prev => prev.map(c => c.id === updated.id ? updated : c));
        showSystemAlert({
          type: 'success',
          title: 'Configuration Saved',
          message: `Rule "${updated.name}" updated successfully.`
        });
      } else {
        const created = await api.createColumnConfiguration(payload);
        setConfigurations(prev => [created, ...prev]);
        showSystemAlert({
          type: 'success',
          title: 'Rule Created',
          message: `New configuration "${created.name}" created and active.`
        });
      }
      setIsModalOpen(false);
      setEditingConfig(null);
    } catch (err: any) {
      showSystemAlert({
        type: 'error',
        title: 'Save Failed',
        message: err.message || 'Could not save configuration'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Test Evaluation Handler
  const handleTestRule = async (configToTest: Partial<DatabaseColumnConfiguration>) => {
    if (previewRows.length === 0) {
      showSystemAlert({
        type: 'warning',
        title: 'No Sample Data',
        message: 'There are no sample rows loaded from the database to test this rule against. Try refreshing the preview.'
      });
      return;
    }

    if (configToTest.ruleType === 'DUPLICATE_CHECK' || configToTest.ruleType === 'UNIQUE_CONSTRAINT') {
      if (!configToTest.columns || configToTest.columns.length === 0) {
        showSystemAlert({
          type: 'warning',
          title: 'Column Required',
          message: 'In Duplicate Check, at least one column must be selected to check for value or count.'
        });
        return;
      }
    }

    setIsTesting(true);
    try {
      const res = await api.testColumnConfiguration(configToTest, previewRows);
      setTestResult({
        ruleName: configToTest.name || 'Column Rule',
        verdict: res.verdict,
        totalRows: res.totalRows,
        violationCount: res.violationCount,
        violations: res.violations || [],
        passedCount: res.passedCount ?? (res.totalRows - (res.violationCount || 0)),
        passedRows: res.passedRows || []
      });
      setTestResultFilter('ALL');
    } catch (err: any) {
      showSystemAlert({
        type: 'error',
        title: 'Evaluation Error',
        message: `Failed to test rule: ${err.message}`
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Priority Column Helpers for Modal
  const handleAddColumnToRule = (colName: string) => {
    if (!editingConfig) return;
    const currentCols = editingConfig.columns || [];
    if (currentCols.some(c => c.columnName === colName)) {
      showSystemAlert({ type: 'info', title: 'Already Added', message: `Column "${colName}" is already in the priority list.` });
      return;
    }
    const newPriority = currentCols.length + 1;
    const updated = [
      ...currentCols,
      {
        columnName: colName,
        priority: newPriority,
        role: newPriority === 1 ? 'MATCH_KEY' : 'DISCRIMINATOR',
        matchMode: 'EXACT' as const,
        transform: 'NONE' as const
      }
    ];
    setEditingConfig({ ...editingConfig, columns: updated });
  };

  const handleRemoveColumnFromRule = (index: number) => {
    if (!editingConfig) return;
    const updated = (editingConfig.columns || [])
      .filter((_, i) => i !== index)
      .map((c, i) => ({ ...c, priority: i + 1 }));
    setEditingConfig({ ...editingConfig, columns: updated });
  };

  const handleMoveColumnPriority = (index: number, direction: 'up' | 'down') => {
    if (!editingConfig || !editingConfig.columns) return;
    const cols = [...editingConfig.columns];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= cols.length) return;

    const temp = cols[index];
    cols[index] = cols[targetIdx];
    cols[targetIdx] = temp;

    // reassign priorities sequentially
    const reordered = cols.map((c, i) => ({ ...c, priority: i + 1 }));
    setEditingConfig({ ...editingConfig, columns: reordered });
  };

  const handleUpdateColumnProp = (index: number, field: keyof RuleColumnPriority, value: any) => {
    if (!editingConfig || !editingConfig.columns) return;
    const updated = [...editingConfig.columns];
    updated[index] = { ...updated[index], [field]: value };
    setEditingConfig({ ...editingConfig, columns: updated });
  };

  const handleDiscoverTables = async () => {
    if (!selectedDbId) return;
    setIsLoadingTables(true);
    try {
      const discRes = await api.discoverDatabaseTables(selectedDbId);
      const tableList = extractTableNames(discRes);
      if (tableList.length > 0) {
        setTables(tableList);
        setSelectedTable(prev => (tableList.includes(prev) ? prev : tableList[0]));
        showSystemAlert({
          type: 'success',
          title: 'Tables Discovered',
          message: `Discovered ${tableList.length} table(s) in ${currentDb?.name || 'database'}.`
        });
      } else {
        showSystemAlert({
          type: 'info',
          title: 'Scan Finished',
          message: `No additional tables found. Ensure the database connection is running and accessible.`
        });
      }
    } catch (err: any) {
      showSystemAlert({
        type: 'error',
        title: 'Table Discovery Error',
        message: err.message || 'Could not discover tables'
      });
    } finally {
      setIsLoadingTables(false);
    }
  };

  // Restrict view if user is non-admin and has no created resources
  if (!isAdmin && activeDbs.length === 0) {
    return (
      <div className="w-full bg-white border border-slate-200 rounded-2xl p-8 shadow-xs text-center space-y-4 font-sans" id="no-created-resources-banner">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#155DFC] mx-auto shadow-2xs">
          <Lock size={26} />
        </div>
        <div className="max-w-md mx-auto space-y-1.5">
          <h3 className="text-base font-bold text-slate-900">Resource-Scoped Field Mapping</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            You are authorized to configure field mappings and validation rules strictly for database resources created by you or your team. No resources created by your account or team were found.
          </p>
        </div>
        <div className="pt-2">
          <p className="text-[11px] text-slate-400 font-mono">
            Navigate to <strong>Team Workspace &rarr; Resources</strong> to configure a team connection first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-5 animate-fadeIn">
      {/* READ-ONLY NOTICE FOR DB/NON-OPS TEAMS */}
      {!canManageColumnMapping && (
        <div className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start gap-2.5 shadow-2xs">
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Read-Only Operational View:</span>
            <p className="mt-0.5 text-amber-800 leading-relaxed">
              Your current account or team does not possess operational column mapping privileges (<code className="font-mono text-[11px] bg-amber-100 px-1 py-0.2 rounded">canManageColumnMapping: false</code>). You may inspect database tables, schemas, and live data previews, but creating, modifying, and deleting column validation rules is strictly reserved for Operational Teams.
            </p>
          </div>
        </div>
      )}

      {/* 1. TOP HEADER & DATABASE/TABLE SELECTOR BAR */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-2.5 sm:p-3 text-slate-800 shadow-xs flex items-center justify-between gap-2 overflow-x-auto no-scrollbar" id="db-column-config-header">
        <div className="flex items-center gap-2 shrink-0">
          <div className="p-1.5 bg-blue-50 text-[#155DFC] rounded-lg border border-blue-200/60 shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <h2 className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight whitespace-nowrap">DB Column Rules</h2>
            <span className="hidden xl:inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200/60 whitespace-nowrap">
              Zero Hardcoded
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0" id="db-config-selectors-row">
          {/* Database Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 shrink-0">
            <Database className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <label className="text-[11px] text-slate-500 font-medium shrink-0">DB:</label>
            <select
              value={selectedDbId}
              onChange={(e) => setSelectedDbId(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer pr-1 max-w-[120px] sm:max-w-[140px] truncate"
            >
              {activeDbs.map((db) => (
                <option key={db.id} value={db.id} className="bg-white text-slate-800">
                  {db.name} ({db.type})
                </option>
              ))}
            </select>
          </div>

          {/* Table Selector */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-700 shrink-0">
            <Table className="w-3.5 h-3.5 text-purple-600 shrink-0" />
            <label className="text-[11px] text-slate-500 font-medium shrink-0">
              Table{tables.length > 0 ? ` (${tables.length})` : ''}:
            </label>
            <select
              value={selectedTable}
              onChange={(e) => setSelectedTable(e.target.value)}
              disabled={isLoadingTables || tables.length === 0}
              className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer pr-1 disabled:opacity-50 font-mono max-w-[110px] sm:max-w-[130px] truncate"
            >
              {tables.length === 0 ? (
                <option value="" className="bg-white text-slate-500 font-sans">
                  {isLoadingTables ? 'Scanning...' : 'No Tables'}
                </option>
              ) : (
                tables.map((tbl) => (
                  <option key={tbl} value={tbl} className="bg-white text-slate-800 font-mono">
                    {tbl}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Discover / Scan Tables Action */}
          <button
            type="button"
            onClick={handleDiscoverTables}
            disabled={isLoadingTables || !selectedDbId}
            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-slate-200 transition cursor-pointer disabled:opacity-50 shrink-0 whitespace-nowrap"
            title="Introspect and scan database for all tables"
          >
            <Sparkles className={`w-3.5 h-3.5 text-amber-500 ${isLoadingTables ? 'animate-spin' : ''}`} />
            <span>{isLoadingTables ? 'Scanning...' : 'Scan Tables'}</span>
          </button>

          {/* Refresh Button */}
          <button
            type="button"
            onClick={() => {
              if (selectedDbId && selectedTable) {
                loadTablePreview(selectedDbId, selectedTable);
                loadConfigurations(selectedDbId, selectedTable);
              }
            }}
            disabled={isLoadingPreview || isLoadingConfigs}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-lg border border-slate-200 transition cursor-pointer shrink-0"
            title="Refresh Preview & Configurations"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPreview || isLoadingConfigs ? 'animate-spin' : ''}`} />
          </button>

          {/* Create Rule Button */}
          <button
            type="button"
            onClick={() => handleOpenCreateModal()}
            disabled={!selectedTable || !canManageColumnMapping}
            title={!canManageColumnMapping ? 'Column mapping is restricted to Operational Teams' : undefined}
            className="px-3 py-1.5 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer disabled:opacity-50 shrink-0 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Column Rule</span>
          </button>
        </div>
      </div>

      {/* 2. LIVE DATABASE DATA VIEWER (FOR EASY GUIDED VISUAL CONFIGURATION) */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div 
          onClick={() => setIsPreviewExpanded(!isPreviewExpanded)}
          className="px-4 py-3 bg-slate-50/80 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2 cursor-pointer hover:bg-slate-100/70 transition"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-purple-100 text-purple-700 rounded-lg">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Live Table Data Preview: <span className="text-blue-600 font-mono lowercase">{selectedTable || 'Select Table'}</span>
                </h3>
                {previewSource && (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    previewSource === 'LIVE_DATABASE' 
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}>
                    {previewSource === 'LIVE_DATABASE' ? '● Direct DB Query' : '● PostgreSQL Mirror'}
                  </span>
                )}
                {previewExecutionMs > 0 && (
                  <span className="text-[10px] font-mono text-slate-500">
                    {previewExecutionMs}ms
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Click <span className="font-semibold text-blue-600">+ Rule</span> on any column header to instantly configure rules using actual database values as reference.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-xs font-medium text-slate-500 bg-white border border-slate-200 px-2 py-1 rounded-md">
              {previewColumns.length} Columns · {previewRowCount} Sample Records
            </span>
            {isPreviewExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
        </div>

        {isPreviewExpanded && (
          <div className="p-4 space-y-3">
            {/* Preview Toolbar */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter sample data values..."
                  value={previewSearchTerm}
                  onChange={(e) => setPreviewSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                />
              </div>
              <div className="text-[11px] text-slate-500">
                Showing top {filteredPreviewRows.length} rows (Read-only sample projection)
              </div>
            </div>

            {/* Table Container */}
            {isLoadingPreview ? (
              <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
                <span>Reading live sample records from database...</span>
              </div>
            ) : previewColumns.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No column metadata discovered for table "{selectedTable}". Ensure the database is accessible.
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-72 shadow-2xs">
                <table className="w-full text-left text-xs border-collapse divide-y divide-slate-200">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 font-semibold shadow-2xs">
                    <tr>
                      <th className="px-3 py-2 text-[10px] uppercase font-bold text-slate-400 w-10 text-center">#</th>
                      {previewColumns.map((col, cIdx) => {
                        const colName = col.name || (typeof col === 'string' ? col : `col_${cIdx}`);
                        const colType = col.type || 'text';
                        return (
                          <th key={`${colName}-${cIdx}`} className="px-3 py-2 font-mono whitespace-nowrap">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <div className="font-bold text-slate-800">{colName}</div>
                                <div className="text-[10px] text-slate-400 font-normal">{colType}</div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenCreateModal(colName);
                                }}
                                className="px-1.5 py-0.5 bg-blue-50 hover:bg-blue-600 hover:text-white text-blue-600 border border-blue-200 rounded text-[10px] font-bold transition flex items-center gap-0.5 cursor-pointer"
                                title={`Create Rule on ${colName}`}
                              >
                                <Plus className="w-2.5 h-2.5" />
                                <span>Rule</span>
                              </button>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white font-mono text-[11px]">
                    {filteredPreviewRows.length === 0 ? (
                      <tr>
                        <td colSpan={previewColumns.length + 1} className="py-6 text-center text-slate-400 font-sans text-xs">
                          No matching records found in preview.
                        </td>
                      </tr>
                    ) : (
                      filteredPreviewRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/40 transition">
                          <td className="px-3 py-1.5 text-slate-400 text-center text-[10px]">{idx + 1}</td>
                          {previewColumns.map((col, cIdx) => {
                            const colName = col.name || (typeof col === 'string' ? col : `col_${cIdx}`);
                            const val = getRowCellValue(row, colName);
                            return (
                              <td 
                                key={`${colName}-${cIdx}`} 
                                className="px-3 py-1.5 text-slate-700 whitespace-nowrap max-w-xs truncate" 
                                title={val !== null && val !== undefined ? (typeof val === 'object' ? JSON.stringify(val) : String(val)) : ''}
                              >
                                {val === null || val === undefined ? (
                                  <span className="text-slate-300 italic font-sans">—</span>
                                ) : typeof val === 'boolean' ? (
                                  val ? 'true' : 'false'
                                ) : typeof val === 'object' ? (
                                  JSON.stringify(val)
                                ) : (
                                  String(val)
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
            )}
          </div>
        )}
      </div>

      {/* 3. TEST RESULTS VERDICT BANNER / DETAIL VIEW */}
      {testResult && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden animate-fadeIn space-y-0">
          <div className={`p-4 border-b flex flex-wrap items-center justify-between gap-3 ${
            testResult.verdict === 'PASS' 
              ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900' 
              : 'bg-slate-900 border-slate-800 text-white'
          }`}>
            <div className="flex items-center gap-3">
              {testResult.verdict === 'PASS' ? (
                <div className="p-2 bg-emerald-600 text-white rounded-lg">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              ) : (
                <div className="p-2 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg">
                  <AlertOctagon className="w-5 h-5" />
                </div>
              )}
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-bold">
                    Rule Evaluation Result: <span className="font-mono">{testResult.ruleName}</span>
                  </h4>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wider ${
                    testResult.verdict === 'PASS'
                      ? 'bg-emerald-200 text-emerald-900'
                      : 'bg-rose-500 text-white'
                  }`}>
                    {testResult.verdict === 'PASS' ? 'STATUS: ALL PASSED' : `VIOLATIONS FOUND (${testResult.violationCount})`}
                  </span>
                </div>
                <p className={`text-xs mt-0.5 ${testResult.verdict === 'PASS' ? 'text-emerald-800' : 'text-slate-300'}`}>
                  Evaluated across <strong className="font-mono">{testResult.totalRows}</strong> records: &nbsp;
                  <span className="text-emerald-400 font-bold">{testResult.passedCount ?? (testResult.totalRows - testResult.violationCount)} Passed</span>
                  {testResult.violationCount > 0 && (
                    <span className="text-rose-400 font-bold ml-2">• {testResult.violationCount} Violations</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTestResult(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition cursor-pointer"
                title="Dismiss test results"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* FILTER TABS: All Records / Passed Values / Violations */}
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Display Filter:</span>
              <button
                type="button"
                onClick={() => setTestResultFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  testResultFilter === 'ALL'
                    ? 'bg-slate-800 text-white shadow-xs'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Layers className="w-3 h-3" />
                All Evaluated ({testResult.totalRows})
              </button>

              <button
                type="button"
                onClick={() => setTestResultFilter('PASSED')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  testResultFilter === 'PASSED'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white text-emerald-800 border border-emerald-200 hover:bg-emerald-50'
                }`}
              >
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                Passed Values ({testResult.passedCount ?? (testResult.totalRows - testResult.violationCount)})
              </button>

              <button
                type="button"
                onClick={() => setTestResultFilter('VIOLATIONS')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  testResultFilter === 'VIOLATIONS'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-white text-rose-800 border border-rose-200 hover:bg-rose-50'
                }`}
              >
                <AlertTriangle className="w-3 h-3 text-rose-500" />
                Violations ({testResult.violationCount})
              </button>
            </div>

            <div className="text-[11px] text-slate-500">
              Showing {
                testResultFilter === 'PASSED' ? (testResult.passedCount ?? (testResult.totalRows - testResult.violationCount)) :
                testResultFilter === 'VIOLATIONS' ? testResult.violationCount :
                testResult.totalRows
              } row(s)
            </div>
          </div>

          {/* RESULTS TABLE */}
          <div className="p-4">
            <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-72">
              <table className="w-full text-left text-xs divide-y divide-slate-200">
                <thead className="bg-slate-100 font-bold text-slate-700 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-[10px] uppercase text-slate-500 w-14 text-center">Row</th>
                    <th className="px-3 py-2 text-[10px] uppercase text-slate-500 w-24 text-center">Status</th>
                    <th className="px-3 py-2 text-[11px]">Evaluation Info / Business Meaning / Violation Reason</th>
                    <th className="px-3 py-2 text-[11px]">Evaluated Column Data & Constants</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white font-mono text-[11px]">
                  {/* Violations */}
                  {(testResultFilter === 'ALL' || testResultFilter === 'VIOLATIONS') && testResult.violations.map((v, i) => (
                    <tr key={`viol-${i}`} className="hover:bg-rose-50/40 bg-rose-50/15">
                      <td className="px-3 py-2 text-center text-slate-500 font-sans font-semibold">{v.rowIndex + 1}</td>
                      <td className="px-3 py-2 text-center font-sans">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200">
                          VIOLATION
                        </span>
                      </td>
                      <td className="px-3 py-2 text-rose-700 font-sans font-medium">
                        {v.reason}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        <div className="flex flex-wrap items-center gap-1">
                          {Object.entries(v.matchedPriorityValues || {}).map(([key, val]) => (
                            <span key={key} className="px-1.5 py-0.5 bg-rose-100/60 rounded text-[10px] border border-rose-200 text-rose-900">
                              <strong className="font-bold">{key}:</strong> {String(val)}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {/* Passed Rows */}
                  {(testResultFilter === 'ALL' || testResultFilter === 'PASSED') && (testResult.passedRows || []).map((p, i) => (
                    <tr key={`pass-${i}`} className="hover:bg-emerald-50/40 bg-emerald-50/15">
                      <td className="px-3 py-2 text-center text-slate-500 font-sans font-semibold">{p.rowIndex + 1}</td>
                      <td className="px-3 py-2 text-center font-sans">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          PASS
                        </span>
                      </td>
                      <td className="px-3 py-2 text-emerald-800 font-sans font-medium">
                        {p.info || 'Rule criteria satisfied'}
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        <div className="flex flex-wrap items-center gap-1">
                          {Object.entries(p.matchedPriorityValues || {}).map(([key, val]) => (
                            <span key={key} className="px-1.5 py-0.5 bg-emerald-100/70 rounded text-[10px] border border-emerald-200 text-emerald-950 font-bold">
                              <span className="text-emerald-700">{key}:</span> {String(val)}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}

                  {/* Empty state for the filter */}
                  {testResultFilter === 'PASSED' && (!testResult.passedRows || testResult.passedRows.length === 0) && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-slate-400 font-sans text-xs">
                        No rows passed the rule criteria.
                      </td>
                    </tr>
                  )}

                  {testResultFilter === 'VIOLATIONS' && testResult.violations.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-emerald-700 font-sans text-xs font-bold">
                        <CheckCircle2 className="w-5 h-5 inline mr-1 text-emerald-600" />
                        Zero violations! All {testResult.totalRows} records passed the rule successfully.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. CONFIGURED COLUMN RULES LIST / MANAGER */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Active Configurations for <span className="font-mono text-blue-600">{selectedTable || 'All Tables'}</span>
            </h3>
            <p className="text-xs text-slate-500">
              {filteredConfigurations.length} rule configuration(s) established. Priority column rankings are evaluated in sequential order.
            </p>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search rules or columns..."
                value={searchRuleQuery}
                onChange={(e) => setSearchRuleQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 w-44"
              />
            </div>

            <select
              value={filterRuleType}
              onChange={(e) => setFilterRuleType(e.target.value)}
              className="text-xs p-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none font-medium cursor-pointer"
            >
              <option value="ALL">All Rule Types</option>
              {RULE_TYPE_OPTIONS.map(opt => (
                <option key={opt.type} value={opt.type}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Configurations Grid */}
        {isLoadingConfigs ? (
          <div className="py-12 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-blue-600" />
            <span>Loading column configurations...</span>
          </div>
        ) : filteredConfigurations.length === 0 ? (
          <div className="py-12 border-2 border-dashed border-slate-200 rounded-xl text-center space-y-3">
            <div className="p-3 bg-slate-100 text-slate-400 rounded-full w-fit mx-auto">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800">No Column Rules Configured Yet</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                You can configure duplicate checks, multi-column grouping checks, or uniqueness constraints with zero hardcoded constraints.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenCreateModal()}
              disabled={!selectedTable}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Rule for {selectedTable || 'Table'}</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredConfigurations.map((cfg) => {
              const ruleMeta = RULE_TYPE_OPTIONS.find(o => o.type === cfg.ruleType) || {
                type: cfg.ruleType,
                label: cfg.ruleType,
                description: '',
                badgeColor: 'bg-slate-100 text-slate-800 border-slate-200'
              };

              return (
                <div 
                  key={cfg.id}
                  className={`border rounded-xl p-4 space-y-3.5 transition shadow-2xs hover:shadow-xs ${
                    cfg.isActive ? 'border-slate-200 bg-white' : 'border-slate-200/60 bg-slate-50/60 opacity-75'
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-slate-900 tracking-tight">{cfg.name}</h4>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${ruleMeta.badgeColor}`}>
                          {ruleMeta.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-1">{cfg.description || 'No description provided'}</p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(cfg)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition cursor-pointer ${
                          cfg.isActive 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                            : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                        }`}
                        title="Toggle rule status"
                      >
                        {cfg.isActive ? 'Active' : 'Disabled'}
                      </button>
                    </div>
                  </div>

                  {/* Priority Column List Preview */}
                  <div className="p-2.5 bg-slate-50 border border-slate-150 rounded-lg space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <span>Priority Column Order</span>
                      <span>{cfg.columns.length} Column(s)</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {cfg.columns.map((col, idx) => (
                        <div 
                          key={col.columnName}
                          className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded text-[11px] font-mono shadow-2xs"
                        >
                          <span className={`w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center ${
                            col.priority === 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                          }`}>
                            P{col.priority}
                          </span>
                          <span className="font-bold text-slate-800">{col.columnName}</span>
                          {col.matchMode && col.matchMode !== 'EXACT' && (
                            <span className="text-[9px] text-slate-400 font-sans">({col.matchMode})</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Duplicate Check Criteria details */}
                  {(cfg.ruleType === 'DUPLICATE_CHECK' || cfg.ruleType === 'UNIQUE_CONSTRAINT') && (
                    <div className="text-[11px] text-slate-600 bg-amber-50/70 border border-amber-200/80 rounded-lg p-2.5 space-y-1">
                      <div className="flex items-center justify-between flex-wrap gap-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-amber-950">Checked for Value & Count:</span>
                          {(!cfg.columns || cfg.columns.length === 0) ? (
                            <span className="text-rose-600 font-bold">⚠️ No columns configured (at least one required)</span>
                          ) : (
                            <span className="font-mono font-bold text-amber-900 bg-white px-1.5 py-0.5 rounded border border-amber-200">
                              {cfg.columns.map(c => c.columnName).join(' + ')}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-bold border border-amber-300">
                          {cfg.aggregationRules?.[0]
                            ? `COUNT ${cfg.aggregationRules[0].operator || '>'} ${cfg.aggregationRules[0].value ?? 1}`
                            : 'COUNT > 1 (Duplicates)'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Grouping Check / Aggregation details */}
                  {cfg.ruleType === 'GROUPING_CHECK' && (
                    <div className="text-[11px] text-slate-600 bg-blue-50/60 border border-blue-100 rounded-lg p-2 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-semibold text-blue-900">Grouping: </span>
                          <span>{cfg.groupByColumns && cfg.groupByColumns.length > 0 ? cfg.groupByColumns.join(', ') : 'All priority columns'}</span>
                        </div>
                        {cfg.aggregationRules && cfg.aggregationRules.length > 0 && (
                          <span className="font-mono font-bold text-blue-800">
                            {cfg.aggregationRules[0].function}({cfg.aggregationRules[0].column || '*'}) {cfg.aggregationRules[0].operator} {cfg.aggregationRules[0].value}
                          </span>
                        )}
                      </div>

                      {cfg.typeGroups && cfg.typeGroups.length > 0 && (
                        <div className="pt-1 border-t border-blue-100 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-blue-950 uppercase">Type-Group-Specific Rules:</span>
                            <span className="text-[10px] font-bold px-1.5 py-0.2 bg-blue-200/80 text-blue-900 rounded">
                              {cfg.typeGroups.length} Group(s)
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {cfg.typeGroups.map((tg, i) => (
                              <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-white border border-blue-200 text-blue-900 flex items-center gap-1 font-semibold">
                                <span className="font-bold">{tg.groupName}</span>
                                {tg.expectedLegCount && (
                                  <span className="text-[9px] text-emerald-700 bg-emerald-50 px-1 rounded">
                                    Legs {tg.expectedLegCount.operator} {tg.expectedLegCount.value}
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Type-Based Leg & Group Relationship Check details */}
                  {cfg.ruleType === 'TYPE_RELATION_CHECK' && (
                    <div className="text-[11px] text-indigo-900 bg-indigo-50/70 border border-indigo-150 rounded-lg p-2.5 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-indigo-950">Correlation Key:</span>
                          <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-indigo-200 font-bold text-indigo-800">
                            {cfg.primaryKeyColumn || cfg.columns[0]?.columnName || 'N/A'}
                          </span>
                          {cfg.roleColumn && (
                            <>
                              <span className="text-slate-300 font-bold">|</span>
                              <span className="font-bold text-indigo-950">Role Column:</span>
                              <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-indigo-200 font-bold text-purple-800">
                                {cfg.roleColumn}
                              </span>
                            </>
                          )}
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-600 text-white shadow-2xs">
                          {cfg.typeGroups?.length || 0} Type Group(s)
                        </span>
                      </div>

                      {cfg.typeGroups && cfg.typeGroups.length > 0 && (
                        <div className="space-y-1.5 pt-1 border-t border-indigo-100">
                          {cfg.typeGroups.map((tg, i) => (
                            <div key={i} className="flex flex-wrap items-center justify-between gap-1.5 p-1.5 bg-white rounded-md border border-indigo-150 text-[10px]">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="font-bold text-indigo-950">{tg.groupName}:</span>
                                {tg.conditions.map((c, ci) => (
                                  <span key={ci} className="px-1 py-0.2 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 font-mono">
                                    {c.columnName} {c.operator} {c.value}
                                  </span>
                                ))}
                              </div>
                              <div className="flex items-center gap-1">
                                {tg.expectedLegCount && (
                                  <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                                    Legs {tg.expectedLegCount.operator} {tg.expectedLegCount.value}
                                  </span>
                                )}
                                {tg.legRelationships && tg.legRelationships.length > 0 && (
                                  <span className="px-1.5 py-0.2 rounded bg-purple-50 text-purple-800 border border-purple-200 font-bold">
                                    {tg.legRelationships.length} Relation(s)
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Multi-Row Semantic Check details */}
                  {cfg.ruleType === 'MULTI_ROW_SEMANTIC_CHECK' && (
                    <div className="text-[11px] text-teal-900 bg-teal-50/70 border border-teal-150 rounded-lg p-2.5 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-teal-950">Correlation Key:</span>
                          <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-teal-200 font-bold text-teal-800">
                            {cfg.primaryKeyColumn || cfg.columns[0]?.columnName || 'N/A'}
                          </span>
                          <span className="text-slate-300 font-bold">|</span>
                          <span className="font-bold text-teal-950">Role Column:</span>
                          <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-teal-200 font-bold text-teal-800">
                            {cfg.roleColumn || 'N/A'}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-teal-100/80 text-teal-800 border border-teal-200">
                          {cfg.crossRowRules?.length || 0} Assertion(s)
                        </span>
                      </div>

                      {cfg.semanticRoles && cfg.semanticRoles.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-teal-100">
                          <span className="text-[10px] font-bold text-teal-700 uppercase">Mapped Roles:</span>
                          {cfg.semanticRoles.map((r, i) => (
                            <span key={i} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white text-teal-900 border border-teal-200">
                              {r.roleName} ({r.matchValues.join(', ')})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Value Constant Labeling Check details */}
                  {cfg.ruleType === 'VALUE_LABEL_CHECK' && (
                    <div className="text-[11px] text-emerald-950 bg-emerald-50/70 border border-emerald-200 rounded-lg p-2.5 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-emerald-950">Target Column:</span>
                          <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200 font-bold text-emerald-800">
                            {cfg.primaryKeyColumn || cfg.columns?.[0]?.columnName || 'N/A'}
                          </span>
                          <span className="text-slate-300 font-bold">|</span>
                          <span className="font-bold text-emerald-950">Unmapped Value Action:</span>
                          <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-emerald-200 font-bold text-emerald-800">
                            {cfg.unmappedValueAction || 'FLAG'}
                          </span>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100/80 text-emerald-800 border border-emerald-200">
                          {cfg.valueLabels?.length || 0} Labeled Value(s)
                        </span>
                      </div>

                      {cfg.valueLabels && cfg.valueLabels.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-emerald-100">
                          <span className="text-[10px] font-bold text-emerald-700 uppercase">Values & Business Labels:</span>
                          {cfg.valueLabels.slice(0, 8).map((vl, i) => (
                            <span 
                              key={i} 
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${
                                vl.category === 'ERROR' ? 'bg-red-50 text-red-800 border-red-200' :
                                vl.category === 'WARNING' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                                vl.category === 'INFO' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                                'bg-white text-emerald-900 border-emerald-200'
                              }`}
                            >
                              <span className="font-mono bg-black/5 px-1 rounded">{vl.value}</span>
                              <span>&rarr;</span>
                              <span>{vl.label || 'Unlabeled'}</span>
                            </span>
                          ))}
                          {cfg.valueLabels.length > 8 && (
                            <span className="text-[10px] text-slate-500 font-semibold">+{cfg.valueLabels.length - 8} more</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action & Severity Badges */}
                  <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">On Violation:</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        cfg.violationAction === 'STOP' ? 'bg-red-50 text-red-700 border border-red-200' :
                        cfg.violationAction === 'FLAG' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        cfg.violationAction === 'REPORT' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                        'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {cfg.violationAction}
                      </span>
                      <span className="text-[10px] text-slate-400">Severity:</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        cfg.severity === 'CRITICAL' ? 'text-red-700' :
                        cfg.severity === 'WARNING' ? 'text-amber-700' : 'text-blue-700'
                      }`}>
                        {cfg.severity}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleTestRule(cfg)}
                        disabled={isTesting}
                        className="p-1.5 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded-md transition cursor-pointer"
                        title="Test on live database data"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      {canManageColumnMapping && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleCloneConfig(cfg)}
                            className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-md transition cursor-pointer"
                            title="Clone Configuration"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditConfig(cfg)}
                            className="p-1.5 hover:bg-slate-100 text-slate-600 hover:text-slate-900 rounded-md transition cursor-pointer"
                            title="Edit Configuration"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteConfig(cfg.id, cfg.name)}
                            className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-md transition cursor-pointer"
                            title="Delete Configuration"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. RULE EDITOR MODAL (ZERO HARDCODED SETTINGS) */}
      {isModalOpen && editingConfig && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden my-6">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg border border-blue-500/30">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold tracking-tight">
                    {editingConfig.id ? 'Edit Database Column Rule' : 'Create Database Column Rule'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Target Table: <span className="font-mono text-blue-300">{editingConfig.tableName}</span> on <span className="font-mono text-purple-300">{editingConfig.dbName}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(false);
                  setEditingConfig(null);
                }}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSaveConfig} className="p-6 space-y-5 text-xs max-h-[75vh] overflow-y-auto">
              {/* SECTION A: RULE METADATA */}
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Rule Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Duplicate Card Charge Check"
                      value={editingConfig.name || ''}
                      onChange={(e) => setEditingConfig({ ...editingConfig, name: e.target.value })}
                      className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Rule Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={editingConfig.ruleType}
                      onChange={(e) => setEditingConfig({ ...editingConfig, ruleType: e.target.value as any })}
                      className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                    >
                      {RULE_TYPE_OPTIONS.map(opt => (
                        <option key={opt.type} value={opt.type}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Rule Description
                  </label>
                  <input
                    type="text"
                    placeholder="Brief description of what this rule detects..."
                    value={editingConfig.description || ''}
                    onChange={(e) => setEditingConfig({ ...editingConfig, description: e.target.value })}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* SECTION B: MULTI-COLUMN PRIORITY LIST (HEART OF THE FEATURE) */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Priority Column List
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Order columns by matching priority: Priority 1 is the primary key candidate, Priority 2 is the secondary discriminator, etc.
                    </p>
                  </div>

                  {/* Add Column Dropdown */}
                  <div className="flex items-center gap-1.5">
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAddColumnToRule(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      defaultValue=""
                      className="text-xs p-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg focus:outline-none font-bold cursor-pointer"
                    >
                      <option value="" disabled>+ Add Column to Priority...</option>
                      {previewColumns.map(c => (
                        <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Priority List Items */}
                {(!editingConfig.columns || editingConfig.columns.length === 0) ? (
                  <div className="p-4 border border-dashed border-slate-200 rounded-lg text-center text-slate-400">
                    No columns added to priority list. Select a column above or click "+ Rule" on the live preview table.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {editingConfig.columns.map((col, idx) => (
                      <div 
                        key={col.columnName}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg"
                      >
                        <div className="flex items-center gap-2.5">
                          {/* Priority Badge */}
                          <div className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0 ${
                            col.priority === 1 ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-800'
                          }`}>
                            P{col.priority}
                          </div>
                          <div>
                            <span className="font-mono font-bold text-slate-900 text-xs">{col.columnName}</span>
                            <span className="text-[10px] text-slate-400 ml-1.5 font-sans">
                              {idx === 0 ? '(Primary Match)' : idx === 1 ? '(Secondary)' : '(Tie-Breaker)'}
                            </span>
                          </div>
                        </div>

                        {/* Options: Match Mode & Actions */}
                        <div className="flex items-center gap-2">
                          <select
                            value={col.matchMode || 'EXACT'}
                            onChange={(e) => handleUpdateColumnProp(idx, 'matchMode', e.target.value)}
                            className="text-[11px] p-1 bg-white border border-slate-200 rounded font-medium focus:outline-none"
                            title="Match mode for this column"
                          >
                            <option value="EXACT">Exact Match</option>
                            <option value="CASE_INSENSITIVE">Case Insensitive</option>
                            <option value="TRIMMED">Trim Whitespace</option>
                          </select>

                          {/* Reordering Up/Down */}
                          <div className="flex items-center border border-slate-200 rounded bg-white">
                            <button
                              type="button"
                              onClick={() => handleMoveColumnPriority(idx, 'up')}
                              disabled={idx === 0}
                              className="p-1 hover:bg-slate-100 disabled:opacity-30 text-slate-600 rounded-l"
                              title="Increase Priority"
                            >
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveColumnPriority(idx, 'down')}
                              disabled={idx === (editingConfig.columns?.length || 1) - 1}
                              className="p-1 hover:bg-slate-100 disabled:opacity-30 text-slate-600 rounded-r"
                              title="Decrease Priority"
                            >
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>

                          {/* Remove */}
                          <button
                            type="button"
                            onClick={() => handleRemoveColumnFromRule(idx)}
                            className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded transition"
                            title="Remove Column"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION C.0: DUPLICATE EVALUATION CRITERIA (VALUE & COUNT) */}
              {(editingConfig.ruleType === 'DUPLICATE_CHECK' || editingConfig.ruleType === 'UNIQUE_CONSTRAINT') && (
                <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Copy className="w-4 h-4 text-amber-600" />
                      <div>
                        <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                          Duplicate Check Criteria (Value & Occurrence Count)
                        </h4>
                        <p className="text-[11px] text-amber-800">
                          At least one column must be selected to check for duplicate values or occurrence counts across rows.
                        </p>
                      </div>
                    </div>
                  </div>

                  {(!editingConfig.columns || editingConfig.columns.length === 0) ? (
                    <div className="p-3 bg-amber-100/80 border border-amber-300 rounded-lg flex items-center justify-between text-xs text-amber-950 font-semibold">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                        <span>At least one column must be checked for value or count. Please select a column above.</span>
                      </div>
                      {previewColumns.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handleAddColumnToRule(previewColumns[0].name)}
                          className="px-2.5 py-1 bg-amber-700 hover:bg-amber-800 text-white rounded text-[11px] font-bold transition cursor-pointer shrink-0 ml-2"
                        >
                          + Select "{previewColumns[0].name}"
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {/* Active Columns to Check for Value */}
                      <div className="p-2.5 bg-white border border-amber-200 rounded-lg space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block">
                          Column(s) Evaluated for Duplicate Values ({editingConfig.columns.length}):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {editingConfig.columns.map((c, idx) => (
                            <span
                              key={c.columnName}
                              className="px-2 py-0.5 bg-amber-100 text-amber-950 border border-amber-300 rounded text-[11px] font-mono font-bold flex items-center gap-1"
                            >
                              <span className="text-[9px] bg-amber-600 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center">
                                {idx + 1}
                              </span>
                              {c.columnName}
                              <span className="text-[9px] font-sans font-normal text-amber-700">({c.matchMode || 'EXACT'})</span>
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Occurrence Count Condition */}
                      <div className="p-2.5 bg-white border border-amber-200 rounded-lg space-y-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 block">
                          Occurrence Count Criterion:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-amber-900 mb-1">Check Function</label>
                            <input
                              type="text"
                              value="COUNT(*) (Occurrences)"
                              disabled
                              className="w-full text-xs p-1.5 bg-slate-100 border border-slate-200 rounded font-mono font-bold text-slate-700"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-amber-900 mb-1">Violation When Count</label>
                            <select
                              value={editingConfig.aggregationRules?.[0]?.operator || '>'}
                              onChange={(e) => {
                                const updated = [...(editingConfig.aggregationRules || [{ function: 'COUNT', operator: '>', value: 1 }])];
                                updated[0] = { ...updated[0], function: 'COUNT', operator: e.target.value as any };
                                setEditingConfig({ ...editingConfig, aggregationRules: updated });
                              }}
                              className="w-full text-xs p-1.5 bg-white border border-amber-300 rounded font-bold text-amber-950 focus:outline-none"
                            >
                              <option value=">">&gt; Greater Than (Default: &gt; 1)</option>
                              <option value=">=">&gt;= Greater or Equal</option>
                              <option value="=">= Exactly Equals</option>
                              <option value="!=">!= Not Equal</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-amber-900 mb-1">Threshold Count</label>
                            <input
                              type="number"
                              min={1}
                              value={editingConfig.aggregationRules?.[0]?.value ?? 1}
                              onChange={(e) => {
                                const updated = [...(editingConfig.aggregationRules || [{ function: 'COUNT', operator: '>', value: 1 }])];
                                updated[0] = { ...updated[0], function: 'COUNT', value: Math.max(1, Number(e.target.value) || 1) };
                                setEditingConfig({ ...editingConfig, aggregationRules: updated });
                              }}
                              className="w-full text-xs p-1.5 bg-white border border-amber-300 rounded font-mono font-bold text-amber-950 focus:outline-none"
                            />
                          </div>
                        </div>

                        <p className="text-[10px] text-amber-700 font-medium">
                          Flags any row whose value in <strong className="font-mono font-bold text-amber-950">{editingConfig.columns.map(c => c.columnName).join(' + ')}</strong> appears with occurrence count <strong className="font-mono font-bold">{editingConfig.aggregationRules?.[0]?.operator || '>'} {editingConfig.aggregationRules?.[0]?.value ?? 1}</strong>.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SECTION C: GROUPING CHECKS & AGGREGATIONS (IF GROUPING_CHECK) */}
              {editingConfig.ruleType === 'GROUPING_CHECK' && (
                <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg space-y-3 pt-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600" />
                    <h4 className="text-xs font-bold text-blue-900">Grouping Check Criteria</h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-blue-800 mb-1">Aggregate Func</label>
                      <select
                        value={editingConfig.aggregationRules?.[0]?.function || 'COUNT'}
                        onChange={(e) => {
                          const updated = [...(editingConfig.aggregationRules || [{ function: 'COUNT', operator: '>', value: 1 }])];
                          updated[0] = { ...updated[0], function: e.target.value as any };
                          setEditingConfig({ ...editingConfig, aggregationRules: updated });
                        }}
                        className="w-full text-xs p-1.5 bg-white border border-blue-300 rounded font-bold"
                      >
                        <option value="COUNT">COUNT</option>
                        <option value="SUM">SUM</option>
                        <option value="AVG">AVG</option>
                        <option value="MIN">MIN</option>
                        <option value="MAX">MAX</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-blue-800 mb-1">Target Column</label>
                      <select
                        value={editingConfig.aggregationRules?.[0]?.column || ''}
                        onChange={(e) => {
                          const updated = [...(editingConfig.aggregationRules || [{ function: 'COUNT', operator: '>', value: 1 }])];
                          updated[0] = { ...updated[0], column: e.target.value };
                          setEditingConfig({ ...editingConfig, aggregationRules: updated });
                        }}
                        className="w-full text-xs p-1.5 bg-white border border-blue-300 rounded font-mono"
                      >
                        <option value="">* (All Rows)</option>
                        {previewColumns.map(c => (
                          <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-blue-800 mb-1">Condition Operator</label>
                      <select
                        value={editingConfig.aggregationRules?.[0]?.operator || '>'}
                        onChange={(e) => {
                          const updated = [...(editingConfig.aggregationRules || [{ function: 'COUNT', operator: '>', value: 1 }])];
                          updated[0] = { ...updated[0], operator: e.target.value as any };
                          setEditingConfig({ ...editingConfig, aggregationRules: updated });
                        }}
                        className="w-full text-xs p-1.5 bg-white border border-blue-300 rounded font-bold"
                      >
                        <option value=">">&gt; (Greater Than)</option>
                        <option value=">=">&gt;= (Greater or Equal)</option>
                        <option value="<">&lt; (Less Than)</option>
                        <option value="<=">&lt;= (Less or Equal)</option>
                        <option value="=">= (Equals)</option>
                        <option value="!=">!= (Not Equal)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-blue-800 mb-1">Threshold Value</label>
                      <input
                        type="number"
                        value={editingConfig.aggregationRules?.[0]?.value ?? 1}
                        onChange={(e) => {
                          const updated = [...(editingConfig.aggregationRules || [{ function: 'COUNT', operator: '>', value: 1 }])];
                          updated[0] = { ...updated[0], value: Number(e.target.value) };
                          setEditingConfig({ ...editingConfig, aggregationRules: updated });
                        }}
                        className="w-full text-xs p-1.5 bg-white border border-blue-300 rounded font-mono font-bold"
                      />
                    </div>
                  </div>

                  {/* Type Groups with per-type rules in Grouping Check */}
                  <div className="pt-2 border-t border-blue-200/60 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <h5 className="text-[11px] font-bold text-blue-950 uppercase tracking-wider flex items-center gap-1.5">
                          <Split className="w-3.5 h-3.5 text-blue-600" />
                          <span>Type-Group-Specific Leg & Grouping Rules (Optional)</span>
                        </h5>
                        <p className="text-[10px] text-blue-700">
                          Classify transactions into different Type Groups based on one or multiple columns (e.g. Channel & Message Type), each with its own expected legs and aggregation rules.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const tgs = [...(editingConfig.typeGroups || [])];
                          tgs.push({
                            id: `tg-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
                            groupName: `Type Group ${tgs.length + 1}`,
                            description: '',
                            conditions: [
                              {
                                columnName: previewColumns.length > 0 ? previewColumns[0].name : '',
                                operator: '=',
                                value: ''
                              }
                            ],
                            expectedLegCount: { operator: '==', value: 2 },
                            aggregationRules: [{ function: 'COUNT', operator: '==', value: 2 }]
                          });
                          setEditingConfig({ ...editingConfig, typeGroups: tgs });
                        }}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Type Group</span>
                      </button>
                    </div>

                    {editingConfig.typeGroups && editingConfig.typeGroups.length > 0 && (
                      <div className="space-y-3 pt-1">
                        {editingConfig.typeGroups.map((tg, tgIdx) => (
                          <div key={tg.id || tgIdx} className="p-3 bg-white rounded-lg border border-blue-200 shadow-2xs space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1">
                                <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider">Group #{tgIdx + 1}:</span>
                                <input
                                  type="text"
                                  placeholder="e.g. ATM Cash Withdrawal, Card Purchase, Reversal"
                                  value={tg.groupName}
                                  onChange={(e) => {
                                    const updated = [...(editingConfig.typeGroups || [])];
                                    updated[tgIdx] = { ...updated[tgIdx], groupName: e.target.value };
                                    setEditingConfig({ ...editingConfig, typeGroups: updated });
                                  }}
                                  className="text-xs p-1.5 bg-blue-50/50 border border-blue-200 rounded font-bold text-blue-950 flex-1 max-w-xs"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = (editingConfig.typeGroups || []).filter((_, i) => i !== tgIdx);
                                  setEditingConfig({ ...editingConfig, typeGroups: updated });
                                }}
                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                                title="Delete Type Group"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Conditions (One or Multiple Columns) */}
                            <div className="p-2 bg-slate-50/70 border border-slate-200 rounded space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                                  Classification Conditions (Single or Composite Columns)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...(editingConfig.typeGroups || [])];
                                    const conds = [...(updated[tgIdx].conditions || [])];
                                    conds.push({
                                      columnName: previewColumns.length > 0 ? previewColumns[0].name : '',
                                      operator: '=',
                                      value: ''
                                    });
                                    updated[tgIdx] = { ...updated[tgIdx], conditions: conds };
                                    setEditingConfig({ ...editingConfig, typeGroups: updated });
                                  }}
                                  className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-0.5 cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Add Column Condition (AND)</span>
                                </button>
                              </div>

                              <div className="space-y-1.5">
                                {tg.conditions.map((cond, cIdx) => {
                                  const sampleVals = getDiscoveredColumnValues(cond.columnName);
                                  return (
                                    <div key={cIdx} className="space-y-1">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <select
                                          value={cond.columnName}
                                          onChange={(e) => {
                                            const updated = [...(editingConfig.typeGroups || [])];
                                            const conds = [...updated[tgIdx].conditions];
                                            conds[cIdx] = { ...conds[cIdx], columnName: e.target.value };
                                            updated[tgIdx] = { ...updated[tgIdx], conditions: conds };
                                            setEditingConfig({ ...editingConfig, typeGroups: updated });
                                          }}
                                          className="text-xs p-1 bg-white border border-slate-300 rounded font-mono font-bold text-slate-800"
                                        >
                                          {previewColumns.map(col => (
                                            <option key={col.name} value={col.name}>{col.name}</option>
                                          ))}
                                        </select>

                                        <select
                                          value={cond.operator}
                                          onChange={(e) => {
                                            const updated = [...(editingConfig.typeGroups || [])];
                                            const conds = [...updated[tgIdx].conditions];
                                            conds[cIdx] = { ...conds[cIdx], operator: e.target.value as any };
                                            updated[tgIdx] = { ...updated[tgIdx], conditions: conds };
                                            setEditingConfig({ ...editingConfig, typeGroups: updated });
                                          }}
                                          className="text-xs p-1 bg-white border border-slate-300 rounded font-bold text-slate-800"
                                        >
                                          <option value="=">=</option>
                                          <option value="!=">!=</option>
                                          <option value="IN">IN (Comma-sep)</option>
                                          <option value="NOT_IN">NOT IN</option>
                                          <option value="STARTS_WITH">STARTS WITH</option>
                                          <option value="LIKE">CONTAINS</option>
                                        </select>

                                        <input
                                          type="text"
                                          placeholder="Matching value(s)..."
                                          value={cond.value}
                                          onChange={(e) => {
                                            const updated = [...(editingConfig.typeGroups || [])];
                                            const conds = [...updated[tgIdx].conditions];
                                            conds[cIdx] = { ...conds[cIdx], value: e.target.value };
                                            updated[tgIdx] = { ...updated[tgIdx], conditions: conds };
                                            setEditingConfig({ ...editingConfig, typeGroups: updated });
                                          }}
                                          className="text-xs p-1 bg-white border border-slate-300 rounded font-mono flex-1 min-w-[120px]"
                                        />

                                        {tg.conditions.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = [...(editingConfig.typeGroups || [])];
                                              const conds = updated[tgIdx].conditions.filter((_, i) => i !== cIdx);
                                              updated[tgIdx] = { ...updated[tgIdx], conditions: conds };
                                              setEditingConfig({ ...editingConfig, typeGroups: updated });
                                            }}
                                            className="p-1 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>

                                      {sampleVals.length > 0 && (
                                        <div className="flex items-center gap-1 flex-wrap pl-1">
                                          <span className="text-[9px] text-slate-400">Sample values:</span>
                                          {sampleVals.map(sv => (
                                            <button
                                              key={sv}
                                              type="button"
                                              onClick={() => {
                                                const updated = [...(editingConfig.typeGroups || [])];
                                                const conds = [...updated[tgIdx].conditions];
                                                conds[cIdx] = { ...conds[cIdx], value: sv };
                                                updated[tgIdx] = { ...updated[tgIdx], conditions: conds };
                                                setEditingConfig({ ...editingConfig, typeGroups: updated });
                                              }}
                                              className="px-1.5 py-0.2 bg-white hover:bg-blue-100 text-slate-700 hover:text-blue-900 border border-slate-200 rounded text-[9px] font-mono transition cursor-pointer"
                                            >
                                              {sv}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Expected Legs & Specific Grouping Aggregations */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                              <div className="flex items-center gap-1.5">
                                <label className="text-[10px] font-bold text-slate-700 whitespace-nowrap">Expected Legs:</label>
                                <select
                                  value={tg.expectedLegCount?.operator || '=='}
                                  onChange={(e) => {
                                    const updated = [...(editingConfig.typeGroups || [])];
                                    updated[tgIdx] = {
                                      ...updated[tgIdx],
                                      expectedLegCount: {
                                        operator: e.target.value as any,
                                        value: updated[tgIdx].expectedLegCount?.value ?? 2
                                      }
                                    };
                                    setEditingConfig({ ...editingConfig, typeGroups: updated });
                                  }}
                                  className="text-xs p-1 bg-white border border-slate-300 rounded font-bold"
                                >
                                  <option value="==">== (Exact)</option>
                                  <option value=">=">&gt;= (Min)</option>
                                  <option value="<=">&lt;= (Max)</option>
                                  <option value="!=">!= (Not Equal)</option>
                                </select>
                                <input
                                  type="number"
                                  value={tg.expectedLegCount?.value ?? 2}
                                  onChange={(e) => {
                                    const updated = [...(editingConfig.typeGroups || [])];
                                    updated[tgIdx] = {
                                      ...updated[tgIdx],
                                      expectedLegCount: {
                                        operator: updated[tgIdx].expectedLegCount?.operator || '==',
                                        value: Number(e.target.value)
                                      }
                                    };
                                    setEditingConfig({ ...editingConfig, typeGroups: updated });
                                  }}
                                  className="text-xs p-1 bg-white border border-slate-300 rounded font-mono w-16"
                                />
                              </div>

                              <div className="flex items-center gap-1.5">
                                <label className="text-[10px] font-bold text-slate-700 whitespace-nowrap">Rule Check:</label>
                                <select
                                  value={tg.aggregationRules?.[0]?.function || 'COUNT'}
                                  onChange={(e) => {
                                    const updated = [...(editingConfig.typeGroups || [])];
                                    const aggs = [...(updated[tgIdx].aggregationRules || [{ function: 'COUNT', operator: '==', value: 2 }])];
                                    aggs[0] = { ...aggs[0], function: e.target.value as any };
                                    updated[tgIdx] = { ...updated[tgIdx], aggregationRules: aggs };
                                    setEditingConfig({ ...editingConfig, typeGroups: updated });
                                  }}
                                  className="text-xs p-1 bg-white border border-slate-300 rounded font-bold"
                                >
                                  <option value="COUNT">COUNT</option>
                                  <option value="SUM">SUM</option>
                                  <option value="AVG">AVG</option>
                                </select>
                                <select
                                  value={tg.aggregationRules?.[0]?.operator || '=='}
                                  onChange={(e) => {
                                    const updated = [...(editingConfig.typeGroups || [])];
                                    const aggs = [...(updated[tgIdx].aggregationRules || [{ function: 'COUNT', operator: '==', value: 2 }])];
                                    aggs[0] = { ...aggs[0], operator: e.target.value as any };
                                    updated[tgIdx] = { ...updated[tgIdx], aggregationRules: aggs };
                                    setEditingConfig({ ...editingConfig, typeGroups: updated });
                                  }}
                                  className="text-xs p-1 bg-white border border-slate-300 rounded font-bold"
                                >
                                  <option value="==">==</option>
                                  <option value="!=">!=</option>
                                  <option value=">">&gt;</option>
                                  <option value="<">&lt;</option>
                                </select>
                                <input
                                  type="number"
                                  value={tg.aggregationRules?.[0]?.value ?? 2}
                                  onChange={(e) => {
                                    const updated = [...(editingConfig.typeGroups || [])];
                                    const aggs = [...(updated[tgIdx].aggregationRules || [{ function: 'COUNT', operator: '==', value: 2 }])];
                                    aggs[0] = { ...aggs[0], value: Number(e.target.value) };
                                    updated[tgIdx] = { ...updated[tgIdx], aggregationRules: aggs };
                                    setEditingConfig({ ...editingConfig, typeGroups: updated });
                                  }}
                                  className="text-xs p-1 bg-white border border-slate-300 rounded font-mono w-16"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SECTION C2: TYPE-BASED LEG & GROUP RELATIONSHIP RULE STUDIO */}
              {editingConfig.ruleType === 'TYPE_RELATION_CHECK' && (
                <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-4 animate-fadeIn">
                  <div className="flex items-center gap-2 border-b border-indigo-100 pb-2.5">
                    <div className="p-1.5 bg-indigo-600 text-white rounded-lg">
                      <GitMerge className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-indigo-950">Type-Based Leg & Group Relationship Studio</h4>
                      <p className="text-[11px] text-indigo-700">
                        Classify multi-row transactions into Type Groups using single or composite columns, and configure per-type expected leg counts and leg balancing relationships.
                      </p>
                    </div>
                  </div>

                  {/* 1. Core Correlation & Role Column Dropdowns */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-indigo-900 mb-1">
                        1. Primary Correlation Key Column <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={editingConfig.primaryKeyColumn || ''}
                        onChange={(e) => {
                          const col = e.target.value;
                          setEditingConfig({ 
                            ...editingConfig, 
                            primaryKeyColumn: col,
                            columns: [
                              { columnName: col, priority: 1, role: 'MATCH_KEY' },
                              ...(editingConfig.columns || []).filter(c => c.columnName !== col)
                            ]
                          });
                        }}
                        className="w-full text-xs p-2 bg-white border border-indigo-300 rounded-lg font-mono font-bold text-indigo-950 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">-- Select Transaction Key Column --</option>
                        {previewColumns.map(c => (
                          <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-indigo-600 mt-1">Shared column linking all rows/legs of the transaction (e.g. UTRNNO, RRN, TRANS_ID).</p>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-indigo-900 mb-1">
                        2. Leg Meaning / Role Column (Optional)
                      </label>
                      <select
                        value={editingConfig.roleColumn || ''}
                        onChange={(e) => setEditingConfig({ ...editingConfig, roleColumn: e.target.value })}
                        className="w-full text-xs p-2 bg-white border border-indigo-300 rounded-lg font-mono font-bold text-indigo-950 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">-- Select Role Discriminator Column --</option>
                        {previewColumns.map(c => (
                          <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-indigo-600 mt-1">Column that identifies the business leg role (e.g. DR_CR, LEG_TYPE, MSG_TYPE).</p>
                    </div>
                  </div>

                  {/* 2. Discovered Distinct Values in Role Column (Clickable chips) */}
                  {editingConfig.roleColumn && discoveredRoleColumnValues.length > 0 && (
                    <div className="p-2.5 bg-white border border-indigo-150 rounded-lg space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800">
                          Discovered Values in "{editingConfig.roleColumn}" ({discoveredRoleColumnValues.length}):
                        </span>
                        <span className="text-[10px] text-indigo-500">Available leg discriminators</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {discoveredRoleColumnValues.map(val => (
                          <span
                            key={val}
                            className="px-2 py-0.5 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded text-[11px] font-mono font-semibold"
                          >
                            {val}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 3. Transaction Type Groups Builder */}
                  <div className="space-y-3 pt-2 border-t border-indigo-150">
                    <div className="flex items-center justify-between">
                      <div>
                        <h5 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                          Transaction Type Groups & Leg Relationship Rules
                        </h5>
                        <p className="text-[10px] text-indigo-700">
                          Define rules for each transaction type based on single or composite columns (e.g. ATM Cash Withdrawal vs. POS Purchase vs. Reversal).
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const tgs = [...(editingConfig.typeGroups || [])];
                          tgs.push({
                            id: `tg-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
                            groupName: `Type Group ${tgs.length + 1}`,
                            description: '',
                            conditions: [
                              {
                                columnName: previewColumns.length > 0 ? previewColumns[0].name : '',
                                operator: '=',
                                value: ''
                              }
                            ],
                            expectedLegCount: { operator: '==', value: 2 },
                            roles: [
                              { roleName: 'Debit', matchValues: ['DR', 'DEBIT'] },
                              { roleName: 'Credit', matchValues: ['CR', 'CREDIT'] }
                            ],
                            legRelationships: [
                              {
                                id: `lr-${Date.now()}`,
                                ruleType: 'VALUE_MATCH',
                                primaryRole: 'Debit',
                                targetRole: 'Credit',
                                valueColumn: previewColumns.find(c => c.type.toLowerCase().includes('num') || c.type.toLowerCase().includes('int') || c.type.toLowerCase().includes('dec'))?.name || '',
                                tolerance: 0
                              }
                            ]
                          });
                          setEditingConfig({ ...editingConfig, typeGroups: tgs });
                        }}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Transaction Type Group</span>
                      </button>
                    </div>

                    {(!editingConfig.typeGroups || editingConfig.typeGroups.length === 0) ? (
                      <div className="p-4 bg-white border border-dashed border-indigo-200 rounded-lg text-center text-indigo-500">
                        No Type Groups defined yet. Click "+ Add Transaction Type Group" to classify transaction types and define their leg relationships.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {editingConfig.typeGroups.map((tg, tgIdx) => (
                          <div key={tg.id || tgIdx} className="p-3.5 bg-white border-2 border-indigo-200 rounded-xl space-y-3 shadow-xs">
                            {/* Header */}
                            <div className="flex items-center justify-between gap-2 border-b border-indigo-100 pb-2">
                              <div className="flex items-center gap-2 flex-1">
                                <span className="p-1 bg-indigo-100 text-indigo-800 rounded font-bold text-[10px]">
                                  TYPE #{tgIdx + 1}
                                </span>
                                <input
                                  type="text"
                                  placeholder="Type Group Name (e.g. ATM Cash Withdrawal, POS Purchase, Card Reversal)"
                                  value={tg.groupName}
                                  onChange={(e) => {
                                    const updated = [...(editingConfig.typeGroups || [])];
                                    updated[tgIdx] = { ...updated[tgIdx], groupName: e.target.value };
                                    setEditingConfig({ ...editingConfig, typeGroups: updated });
                                  }}
                                  className="text-xs p-1.5 bg-indigo-50/50 border border-indigo-300 rounded font-bold text-indigo-950 flex-1 max-w-sm"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = (editingConfig.typeGroups || []).filter((_, i) => i !== tgIdx);
                                  setEditingConfig({ ...editingConfig, typeGroups: updated });
                                }}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                                title="Remove this Type Group"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Classification Conditions (Single or Composite Columns) */}
                            <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                                  Type Classification Conditions (Single or Composite Columns)
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...(editingConfig.typeGroups || [])];
                                    const conds = [...(updated[tgIdx].conditions || [])];
                                    conds.push({
                                      columnName: previewColumns.length > 0 ? previewColumns[0].name : '',
                                      operator: '=',
                                      value: ''
                                    });
                                    updated[tgIdx] = { ...updated[tgIdx], conditions: conds };
                                    setEditingConfig({ ...editingConfig, typeGroups: updated });
                                  }}
                                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Add Column Condition (AND)</span>
                                </button>
                              </div>

                              <div className="space-y-1.5">
                                {tg.conditions.map((cond, cIdx) => {
                                  const sampleVals = getDiscoveredColumnValues(cond.columnName);
                                  return (
                                    <div key={cIdx} className="space-y-1">
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        <select
                                          value={cond.columnName}
                                          onChange={(e) => {
                                            const updated = [...(editingConfig.typeGroups || [])];
                                            const conds = [...updated[tgIdx].conditions];
                                            conds[cIdx] = { ...conds[cIdx], columnName: e.target.value };
                                            updated[tgIdx] = { ...updated[tgIdx], conditions: conds };
                                            setEditingConfig({ ...editingConfig, typeGroups: updated });
                                          }}
                                          className="text-xs p-1 bg-white border border-slate-300 rounded font-mono font-bold text-slate-800"
                                        >
                                          {previewColumns.map(col => (
                                            <option key={col.name} value={col.name}>{col.name}</option>
                                          ))}
                                        </select>

                                        <select
                                          value={cond.operator}
                                          onChange={(e) => {
                                            const updated = [...(editingConfig.typeGroups || [])];
                                            const conds = [...updated[tgIdx].conditions];
                                            conds[cIdx] = { ...conds[cIdx], operator: e.target.value as any };
                                            updated[tgIdx] = { ...updated[tgIdx], conditions: conds };
                                            setEditingConfig({ ...editingConfig, typeGroups: updated });
                                          }}
                                          className="text-xs p-1 bg-white border border-slate-300 rounded font-bold text-slate-800"
                                        >
                                          <option value="=">=</option>
                                          <option value="!=">!=</option>
                                          <option value="IN">IN (Comma-sep)</option>
                                          <option value="NOT_IN">NOT IN</option>
                                          <option value="STARTS_WITH">STARTS WITH</option>
                                          <option value="LIKE">CONTAINS</option>
                                        </select>

                                        <input
                                          type="text"
                                          placeholder="Matching value(s)..."
                                          value={cond.value}
                                          onChange={(e) => {
                                            const updated = [...(editingConfig.typeGroups || [])];
                                            const conds = [...updated[tgIdx].conditions];
                                            conds[cIdx] = { ...conds[cIdx], value: e.target.value };
                                            updated[tgIdx] = { ...updated[tgIdx], conditions: conds };
                                            setEditingConfig({ ...editingConfig, typeGroups: updated });
                                          }}
                                          className="text-xs p-1 bg-white border border-slate-300 rounded font-mono flex-1 min-w-[120px]"
                                        />

                                        {tg.conditions.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = [...(editingConfig.typeGroups || [])];
                                              const conds = updated[tgIdx].conditions.filter((_, i) => i !== cIdx);
                                              updated[tgIdx] = { ...updated[tgIdx], conditions: conds };
                                              setEditingConfig({ ...editingConfig, typeGroups: updated });
                                            }}
                                            className="p-1 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>

                                      {sampleVals.length > 0 && (
                                        <div className="flex items-center gap-1 flex-wrap pl-1">
                                          <span className="text-[9px] text-slate-400">Sample values:</span>
                                          {sampleVals.map(sv => (
                                            <button
                                              key={sv}
                                              type="button"
                                              onClick={() => {
                                                const updated = [...(editingConfig.typeGroups || [])];
                                                const conds = [...updated[tgIdx].conditions];
                                                conds[cIdx] = { ...conds[cIdx], value: sv };
                                                updated[tgIdx] = { ...updated[tgIdx], conditions: conds };
                                                setEditingConfig({ ...editingConfig, typeGroups: updated });
                                              }}
                                              className="px-1.5 py-0.2 bg-white hover:bg-indigo-100 text-slate-700 hover:text-indigo-900 border border-slate-200 rounded text-[9px] font-mono transition cursor-pointer"
                                            >
                                              {sv}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Expected Leg Count for this Type Group */}
                            <div className="p-2.5 bg-indigo-50/50 border border-indigo-150 rounded-lg flex items-center gap-2 flex-wrap">
                              <label className="text-[11px] font-bold text-indigo-950 whitespace-nowrap">Expected Legs / Row Count:</label>
                              <select
                                value={tg.expectedLegCount?.operator || '=='}
                                onChange={(e) => {
                                  const updated = [...(editingConfig.typeGroups || [])];
                                  updated[tgIdx] = {
                                    ...updated[tgIdx],
                                    expectedLegCount: {
                                      operator: e.target.value as any,
                                      value: updated[tgIdx].expectedLegCount?.value ?? 2
                                    }
                                  };
                                  setEditingConfig({ ...editingConfig, typeGroups: updated });
                                }}
                                className="text-xs p-1 bg-white border border-indigo-300 rounded font-bold text-indigo-900"
                              >
                                <option value="==">== (Exact Leg Count)</option>
                                <option value=">=">&gt;= (Minimum Legs)</option>
                                <option value="<=">&lt;= (Maximum Legs)</option>
                                <option value="!=">!= (Not Equal)</option>
                              </select>
                              <input
                                type="number"
                                value={tg.expectedLegCount?.value ?? 2}
                                onChange={(e) => {
                                  const updated = [...(editingConfig.typeGroups || [])];
                                  updated[tgIdx] = {
                                    ...updated[tgIdx],
                                    expectedLegCount: {
                                      operator: updated[tgIdx].expectedLegCount?.operator || '==',
                                      value: Number(e.target.value)
                                    }
                                  };
                                  setEditingConfig({ ...editingConfig, typeGroups: updated });
                                }}
                                className="text-xs p-1 bg-white border border-indigo-300 rounded font-mono font-bold w-16"
                              />
                            </div>

                            {/* Leg Roles for this Type Group */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                                  Leg Roles (Optional for "{tg.groupName}")
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...(editingConfig.typeGroups || [])];
                                    const roles = [...(updated[tgIdx].roles || [])];
                                    roles.push({
                                      roleName: `Leg_${roles.length + 1}`,
                                      matchValues: []
                                    });
                                    updated[tgIdx] = { ...updated[tgIdx], roles };
                                    setEditingConfig({ ...editingConfig, typeGroups: updated });
                                  }}
                                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Add Leg Role</span>
                                </button>
                              </div>

                              <div className="space-y-1.5">
                                {(tg.roles || []).map((role, rIdx) => (
                                  <div key={rIdx} className="flex items-center gap-2 p-1.5 bg-slate-50 border border-slate-200 rounded">
                                    <input
                                      type="text"
                                      placeholder="Role (e.g. Debit, Credit, Fee)"
                                      value={role.roleName}
                                      onChange={(e) => {
                                        const updated = [...(editingConfig.typeGroups || [])];
                                        const roles = [...(updated[tgIdx].roles || [])];
                                        roles[rIdx] = { ...roles[rIdx], roleName: e.target.value };
                                        updated[tgIdx] = { ...updated[tgIdx], roles };
                                        setEditingConfig({ ...editingConfig, typeGroups: updated });
                                      }}
                                      className="text-xs p-1 bg-white border border-slate-300 rounded font-bold w-32"
                                    />
                                    <input
                                      type="text"
                                      placeholder="Matching raw values (e.g. DR, 01, DEBIT)"
                                      value={role.matchValues.join(', ')}
                                      onChange={(e) => {
                                        const updated = [...(editingConfig.typeGroups || [])];
                                        const roles = [...(updated[tgIdx].roles || [])];
                                        roles[rIdx] = {
                                          ...roles[rIdx],
                                          matchValues: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                                        };
                                        updated[tgIdx] = { ...updated[tgIdx], roles };
                                        setEditingConfig({ ...editingConfig, typeGroups: updated });
                                      }}
                                      className="text-xs p-1 bg-white border border-slate-300 rounded font-mono flex-1"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const updated = [...(editingConfig.typeGroups || [])];
                                        const roles = (updated[tgIdx].roles || []).filter((_, i) => i !== rIdx);
                                        updated[tgIdx] = { ...updated[tgIdx], roles };
                                        setEditingConfig({ ...editingConfig, typeGroups: updated });
                                      }}
                                      className="p-1 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Leg Relationships / Assertions */}
                            <div className="space-y-1.5 pt-1 border-t border-slate-100">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-900">
                                  Leg Balancing & Relationship Rules for "{tg.groupName}"
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...(editingConfig.typeGroups || [])];
                                    const rels = [...(updated[tgIdx].legRelationships || [])];
                                    const available = (updated[tgIdx].roles || []).map(r => r.roleName);
                                    rels.push({
                                      id: `lr-${Date.now()}-${Math.random().toString(36).substring(2, 4)}`,
                                      ruleType: 'VALUE_MATCH',
                                      primaryRole: available[0] || 'Debit',
                                      targetRole: available[1] || 'Credit',
                                      valueColumn: previewColumns.find(c => c.type.toLowerCase().includes('num') || c.type.toLowerCase().includes('int') || c.type.toLowerCase().includes('dec'))?.name || '',
                                      tolerance: 0
                                    });
                                    updated[tgIdx] = { ...updated[tgIdx], legRelationships: rels };
                                    setEditingConfig({ ...editingConfig, typeGroups: updated });
                                  }}
                                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Add Leg Relation</span>
                                </button>
                              </div>

                              <div className="space-y-2">
                                {(tg.legRelationships || []).map((rel, relIdx) => {
                                  const availableRoles = (tg.roles || []).map(r => r.roleName);
                                  return (
                                    <div key={relIdx} className="p-2.5 bg-slate-50 border border-indigo-150 rounded-lg space-y-1.5">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-indigo-800 uppercase">
                                          Relation #{relIdx + 1}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const updated = [...(editingConfig.typeGroups || [])];
                                            const rels = (updated[tgIdx].legRelationships || []).filter((_, i) => i !== relIdx);
                                            updated[tgIdx] = { ...updated[tgIdx], legRelationships: rels };
                                            setEditingConfig({ ...editingConfig, typeGroups: updated });
                                          }}
                                          className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                                        <div>
                                          <label className="block text-[9px] font-bold text-slate-500 uppercase">Relation Type</label>
                                          <select
                                            value={rel.ruleType}
                                            onChange={(e) => {
                                              const updated = [...(editingConfig.typeGroups || [])];
                                              const rels = [...(updated[tgIdx].legRelationships || [])];
                                              rels[relIdx] = { ...rels[relIdx], ruleType: e.target.value as any };
                                              updated[tgIdx] = { ...updated[tgIdx], legRelationships: rels };
                                              setEditingConfig({ ...editingConfig, typeGroups: updated });
                                            }}
                                            className="w-full text-xs p-1 bg-white border border-slate-300 rounded font-bold"
                                          >
                                            <option value="VALUE_MATCH">Assert Value Match (Amount Equality)</option>
                                            <option value="ROLE_EXISTENCE">Require Paired Leg (Completeness)</option>
                                            <option value="NET_BALANCE">Net Leg Balance (Zero Sum = 0)</option>
                                            <option value="MUTUAL_EXCLUSION">Incompatible Legs (Cannot Coexist)</option>
                                          </select>
                                        </div>

                                        <div>
                                          <label className="block text-[9px] font-bold text-slate-500 uppercase">Primary Leg Role</label>
                                          <input
                                            type="text"
                                            list={`roles-list-${tgIdx}`}
                                            value={rel.primaryRole}
                                            placeholder="e.g. Debit"
                                            onChange={(e) => {
                                              const updated = [...(editingConfig.typeGroups || [])];
                                              const rels = [...(updated[tgIdx].legRelationships || [])];
                                              rels[relIdx] = { ...rels[relIdx], primaryRole: e.target.value };
                                              updated[tgIdx] = { ...updated[tgIdx], legRelationships: rels };
                                              setEditingConfig({ ...editingConfig, typeGroups: updated });
                                            }}
                                            className="w-full text-xs p-1 bg-white border border-slate-300 rounded font-bold"
                                          />
                                          <datalist id={`roles-list-${tgIdx}`}>
                                            {availableRoles.map(r => <option key={r} value={r} />)}
                                          </datalist>
                                        </div>

                                        <div>
                                          <label className="block text-[9px] font-bold text-slate-500 uppercase">Companion Leg Role</label>
                                          <input
                                            type="text"
                                            list={`roles-list-comp-${tgIdx}`}
                                            value={rel.targetRole || ''}
                                            placeholder="e.g. Credit"
                                            onChange={(e) => {
                                              const updated = [...(editingConfig.typeGroups || [])];
                                              const rels = [...(updated[tgIdx].legRelationships || [])];
                                              rels[relIdx] = { ...rels[relIdx], targetRole: e.target.value };
                                              updated[tgIdx] = { ...updated[tgIdx], legRelationships: rels };
                                              setEditingConfig({ ...editingConfig, typeGroups: updated });
                                            }}
                                            className="w-full text-xs p-1 bg-white border border-slate-300 rounded font-bold"
                                          />
                                          <datalist id={`roles-list-comp-${tgIdx}`}>
                                            {availableRoles.map(r => <option key={r} value={r} />)}
                                          </datalist>
                                        </div>
                                      </div>

                                      {(rel.ruleType === 'VALUE_MATCH' || rel.ruleType === 'NET_BALANCE') && (
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pt-1 border-t border-slate-200">
                                          <div>
                                            <label className="block text-[9px] font-bold text-slate-500 uppercase">Amount Column</label>
                                            <select
                                              value={rel.valueColumn || ''}
                                              onChange={(e) => {
                                                const updated = [...(editingConfig.typeGroups || [])];
                                                const rels = [...(updated[tgIdx].legRelationships || [])];
                                                rels[relIdx] = { ...rels[relIdx], valueColumn: e.target.value };
                                                updated[tgIdx] = { ...updated[tgIdx], legRelationships: rels };
                                                setEditingConfig({ ...editingConfig, typeGroups: updated });
                                              }}
                                              className="w-full text-xs p-1 bg-white border border-slate-300 rounded font-mono"
                                            >
                                              <option value="">-- Select Numeric Column --</option>
                                              {previewColumns.map(col => (
                                                <option key={col.name} value={col.name}>{col.name}</option>
                                              ))}
                                            </select>
                                          </div>

                                          <div>
                                            <label className="block text-[9px] font-bold text-slate-500 uppercase">Target Column (Optional)</label>
                                            <select
                                              value={rel.targetValueColumn || ''}
                                              onChange={(e) => {
                                                const updated = [...(editingConfig.typeGroups || [])];
                                                const rels = [...(updated[tgIdx].legRelationships || [])];
                                                rels[relIdx] = { ...rels[relIdx], targetValueColumn: e.target.value };
                                                updated[tgIdx] = { ...updated[tgIdx], legRelationships: rels };
                                                setEditingConfig({ ...editingConfig, typeGroups: updated });
                                              }}
                                              className="w-full text-xs p-1 bg-white border border-slate-300 rounded font-mono"
                                            >
                                              <option value="">-- Same as Amount Column --</option>
                                              {previewColumns.map(col => (
                                                <option key={col.name} value={col.name}>{col.name}</option>
                                              ))}
                                            </select>
                                          </div>

                                          <div>
                                            <label className="block text-[9px] font-bold text-slate-500 uppercase">Tolerance</label>
                                            <input
                                              type="number"
                                              step="0.01"
                                              value={rel.tolerance ?? 0}
                                              onChange={(e) => {
                                                const updated = [...(editingConfig.typeGroups || [])];
                                                const rels = [...(updated[tgIdx].legRelationships || [])];
                                                rels[relIdx] = { ...rels[relIdx], tolerance: Number(e.target.value) };
                                                updated[tgIdx] = { ...updated[tgIdx], legRelationships: rels };
                                                setEditingConfig({ ...editingConfig, typeGroups: updated });
                                              }}
                                              className="w-full text-xs p-1 bg-white border border-slate-300 rounded font-mono"
                                            />
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SECTION C3: MULTI-ROW TRANSACTION SEMANTICS & CROSS-ROW ASSERTIONS */}
              {editingConfig.ruleType === 'MULTI_ROW_SEMANTIC_CHECK' && (
                <div className="p-4 bg-teal-50/60 border border-teal-200 rounded-xl space-y-4 animate-fadeIn">
                  <div className="flex items-center gap-2 border-b border-teal-100 pb-2.5">
                    <div className="p-1.5 bg-teal-600 text-white rounded-lg">
                      <GitMerge className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-teal-950">Multi-Row Transaction Leg Semantics & Cross-Row Rules</h4>
                      <p className="text-[11px] text-teal-700">Configure correlation keys, column role interpretations, and leg balancing assertions across multi-row transactions.</p>
                    </div>
                  </div>

                  {/* 1. Core Correlation & Role Column Dropdowns */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-indigo-900 mb-1">
                        1. Primary Correlation Key Column <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={editingConfig.primaryKeyColumn || ''}
                        onChange={(e) => {
                          const col = e.target.value;
                          setEditingConfig({ 
                            ...editingConfig, 
                            primaryKeyColumn: col,
                            columns: [
                              { columnName: col, priority: 1, role: 'MATCH_KEY' },
                              ...(editingConfig.columns || []).filter(c => c.columnName !== col)
                            ]
                          });
                        }}
                        className="w-full text-xs p-2 bg-white border border-indigo-300 rounded-lg font-mono font-bold text-indigo-950 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">-- Select Transaction Key Column --</option>
                        {previewColumns.map(c => (
                          <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-indigo-600 mt-1">Shared column linking all rows of the transaction (e.g. UTRNNO, RRN, TRANS_ID).</p>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-indigo-900 mb-1">
                        2. Row Meaning / Role Column <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={editingConfig.roleColumn || ''}
                        onChange={(e) => setEditingConfig({ ...editingConfig, roleColumn: e.target.value })}
                        className="w-full text-xs p-2 bg-white border border-indigo-300 rounded-lg font-mono font-bold text-indigo-950 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">-- Select Role Discriminator Column --</option>
                        {previewColumns.map(c => (
                          <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-indigo-600 mt-1">Column that dictates the business purpose of each row (e.g. TRANS_TYPE, DR_CR, STATUS).</p>
                    </div>
                  </div>

                  {/* 2. Discovered Distinct Values in Role Column (Clickable to Map) */}
                  {editingConfig.roleColumn && discoveredRoleColumnValues.length > 0 && (
                    <div className="p-2.5 bg-white border border-indigo-150 rounded-lg space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-800">
                          Discovered Distinct Values in "{editingConfig.roleColumn}" ({discoveredRoleColumnValues.length}):
                        </span>
                        <span className="text-[10px] text-indigo-500">Click a chip to assign to a role</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {discoveredRoleColumnValues.map(val => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => {
                              const roles = [...(editingConfig.semanticRoles || [])];
                              if (roles.length > 0) {
                                if (!roles[0].matchValues.includes(val)) {
                                  roles[0] = { ...roles[0], matchValues: [...roles[0].matchValues, val] };
                                  setEditingConfig({ ...editingConfig, semanticRoles: roles });
                                }
                              } else {
                                setEditingConfig({
                                  ...editingConfig,
                                  semanticRoles: [{ roleName: `Role_${val}`, matchValues: [val], color: 'indigo' }]
                                });
                              }
                            }}
                            className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded text-[11px] font-mono font-semibold transition cursor-pointer"
                            title={`Click to map "${val}" to a semantic role`}
                          >
                            + {val}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 3. Defined Semantic Roles Builder (Fully Configurable, No Hardcoding) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[11px] font-bold text-indigo-950 uppercase tracking-wider">
                          Defined Row Roles & Meaning Mapping
                        </span>
                        <p className="text-[10px] text-indigo-600">Give any business name to row types (e.g. Debit, Credit, Reversal, Decline, Original) and map raw column values.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const roles = [...(editingConfig.semanticRoles || [])];
                          roles.push({
                            roleName: `Role_${roles.length + 1}`,
                            matchValues: [],
                            color: 'indigo'
                          });
                          setEditingConfig({ ...editingConfig, semanticRoles: roles });
                        }}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Role</span>
                      </button>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {(editingConfig.semanticRoles || []).map((role, rIdx) => (
                        <div key={rIdx} className="p-2.5 bg-white border border-indigo-200 rounded-lg flex flex-col sm:flex-row sm:items-center gap-2">
                          <div className="w-full sm:w-1/3">
                            <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">Role Name</label>
                            <input
                              type="text"
                              value={role.roleName}
                              placeholder="e.g. Debit, Credit, Reversal"
                              onChange={(e) => {
                                const roles = [...(editingConfig.semanticRoles || [])];
                                roles[rIdx] = { ...roles[rIdx], roleName: e.target.value };
                                setEditingConfig({ ...editingConfig, semanticRoles: roles });
                              }}
                              className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded font-bold text-slate-800"
                            />
                          </div>

                          <div className="flex-1">
                            <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">Matching Raw Values (Comma-Separated)</label>
                            <input
                              type="text"
                              value={role.matchValues.join(', ')}
                              placeholder="e.g. DR, DEBIT, 01, 200"
                              onChange={(e) => {
                                const vals = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                                const roles = [...(editingConfig.semanticRoles || [])];
                                roles[rIdx] = { ...roles[rIdx], matchValues: vals };
                                setEditingConfig({ ...editingConfig, semanticRoles: roles });
                              }}
                              className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded font-mono text-slate-800"
                            />
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              const roles = (editingConfig.semanticRoles || []).filter((_, i) => i !== rIdx);
                              setEditingConfig({ ...editingConfig, semanticRoles: roles });
                            }}
                            className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded transition cursor-pointer self-end sm:self-center"
                            title="Remove Role"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 4. Cross-Row Business Assertions Builder */}
                  <div className="space-y-2 pt-2 border-t border-indigo-100">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-[11px] font-bold text-indigo-950 uppercase tracking-wider">
                          Cross-Row Business Assertions & Balance Rules
                        </span>
                        <p className="text-[10px] text-indigo-600">Assert leg completeness (e.g. Debit requires Credit), amount matching, or net balancing across rows sharing the same transaction key.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const rules = [...(editingConfig.crossRowRules || [])];
                          const availableRoles = (editingConfig.semanticRoles || []).map(r => r.roleName);
                          rules.push({
                            id: `crr-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
                            ruleType: 'ROLE_EXISTENCE',
                            primaryRole: availableRoles[0] || 'Debit',
                            targetRole: availableRoles[1] || 'Credit',
                            description: 'Companion leg must exist'
                          });
                          setEditingConfig({ ...editingConfig, crossRowRules: rules });
                        }}
                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Assertion</span>
                      </button>
                    </div>

                    <div className="space-y-2.5 max-h-60 overflow-y-auto">
                      {(editingConfig.crossRowRules || []).map((cRule, crIdx) => {
                        const availableRoles = (editingConfig.semanticRoles || []).map(r => r.roleName);
                        return (
                          <div key={crIdx} className="p-3 bg-white border border-indigo-200 rounded-lg space-y-2 shadow-2xs">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider">
                                Assertion #{crIdx + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = (editingConfig.crossRowRules || []).filter((_, i) => i !== crIdx);
                                  setEditingConfig({ ...editingConfig, crossRowRules: updated });
                                }}
                                className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded transition cursor-pointer"
                                title="Remove Assertion"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div>
                                <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">Condition Type</label>
                                <select
                                  value={cRule.ruleType}
                                  onChange={(e) => {
                                    const updated = [...(editingConfig.crossRowRules || [])];
                                    updated[crIdx] = { ...updated[crIdx], ruleType: e.target.value as any };
                                    setEditingConfig({ ...editingConfig, crossRowRules: updated });
                                  }}
                                  className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded font-bold text-slate-800"
                                >
                                  <option value="ROLE_EXISTENCE">Require Paired Role (Completeness)</option>
                                  <option value="VALUE_MATCH">Assert Value Match (Amount Equality)</option>
                                  <option value="NET_BALANCE">Net Leg Balance (Zero Sum = 0)</option>
                                  <option value="MUTUAL_EXCLUSION">Incompatible Roles (Cannot Coexist)</option>
                                </select>
                              </div>

                              <div>
                                <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">Primary Role</label>
                                <select
                                  value={cRule.primaryRole}
                                  onChange={(e) => {
                                    const updated = [...(editingConfig.crossRowRules || [])];
                                    updated[crIdx] = { ...updated[crIdx], primaryRole: e.target.value };
                                    setEditingConfig({ ...editingConfig, crossRowRules: updated });
                                  }}
                                  className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded font-bold text-slate-800"
                                >
                                  {availableRoles.length === 0 && <option value="">No roles defined</option>}
                                  {availableRoles.map(r => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">Companion / Target Role</label>
                                <select
                                  value={cRule.targetRole || ''}
                                  onChange={(e) => {
                                    const updated = [...(editingConfig.crossRowRules || [])];
                                    updated[crIdx] = { ...updated[crIdx], targetRole: e.target.value };
                                    setEditingConfig({ ...editingConfig, crossRowRules: updated });
                                  }}
                                  className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded font-bold text-slate-800"
                                >
                                  <option value="">-- None / All Other Roles --</option>
                                  {availableRoles.map(r => (
                                    <option key={r} value={r}>{r}</option>
                                  ))}
                                </select>
                              </div>
                            </div>

                            {(cRule.ruleType === 'VALUE_MATCH' || cRule.ruleType === 'NET_BALANCE') && (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-slate-100">
                                <div>
                                  <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">Value / Amount Column</label>
                                  <select
                                    value={cRule.valueColumn || ''}
                                    onChange={(e) => {
                                      const updated = [...(editingConfig.crossRowRules || [])];
                                      updated[crIdx] = { ...updated[crIdx], valueColumn: e.target.value };
                                      setEditingConfig({ ...editingConfig, crossRowRules: updated });
                                    }}
                                    className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded font-mono text-slate-800"
                                  >
                                    <option value="">-- Select Numeric Column --</option>
                                    {previewColumns.map(c => (
                                      <option key={c.name} value={c.name}>{c.name}</option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">Target Column (Optional)</label>
                                  <select
                                    value={cRule.targetValueColumn || ''}
                                    onChange={(e) => {
                                      const updated = [...(editingConfig.crossRowRules || [])];
                                      updated[crIdx] = { ...updated[crIdx], targetValueColumn: e.target.value };
                                      setEditingConfig({ ...editingConfig, crossRowRules: updated });
                                    }}
                                    className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded font-mono text-slate-800"
                                  >
                                    <option value="">-- Same as Primary Column --</option>
                                    {previewColumns.map(c => (
                                      <option key={c.name} value={c.name}>{c.name}</option>
                                    ))}
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">Allowed Tolerance</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={cRule.tolerance ?? 0}
                                    onChange={(e) => {
                                      const updated = [...(editingConfig.crossRowRules || [])];
                                      updated[crIdx] = { ...updated[crIdx], tolerance: Number(e.target.value) };
                                      setEditingConfig({ ...editingConfig, crossRowRules: updated });
                                    }}
                                    className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded font-mono text-slate-800"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION C4: VALUE CONSTANT LABELING & INTERPRETATION */}
              {editingConfig.ruleType === 'VALUE_LABEL_CHECK' && (
                <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between border-b border-emerald-100 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-emerald-600 text-white rounded-lg">
                        <Tag className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-emerald-950">Column Value Labeling & Interpretation Check</h4>
                        <p className="text-[11px] text-emerald-700">Check column values against constants, say something about the row (business meaning/label), and flag unmapped values.</p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const targetCol = editingConfig.primaryKeyColumn || editingConfig.columns?.[0]?.columnName;
                        if (!targetCol) {
                          showSystemAlert({ type: 'warning', title: 'Select Column First', message: 'Please select an evaluation column before scanning unique values.' });
                          return;
                        }
                        const uniqueVals = collectUniqueColumnValues(targetCol);
                        if (uniqueVals.length === 0) {
                          showSystemAlert({ type: 'info', title: 'No Sample Values Found', message: `No non-empty values were found in preview records for column "${targetCol}". You can add values manually using the button below.` });
                          return;
                        }
                        const existingMap = new Map((editingConfig.valueLabels || []).map(vl => [String(vl.value).trim().toLowerCase(), vl]));
                        const merged: ColumnValueLabelMapping[] = [...(editingConfig.valueLabels || [])];
                        let addedCount = 0;
                        uniqueVals.forEach(val => {
                          if (!existingMap.has(val.toLowerCase())) {
                            merged.push({
                              value: val,
                              label: '',
                              category: 'VALID',
                              description: ''
                            });
                            addedCount++;
                          }
                        });
                        setEditingConfig({ ...editingConfig, valueLabels: merged });
                        showSystemAlert({
                          type: 'success',
                          title: 'Values Discovered',
                          message: `Scanned ${uniqueVals.length} unique value(s) from column "${targetCol}". Added ${addedCount} new value(s) to label.`
                        });
                      }}
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                      title="Extract all distinct unique values found in preview records for this column"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      Scan & Collect Unique Values
                    </button>
                  </div>

                  {/* Column selection & Unmapped Action */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-emerald-950 mb-1">
                        Target Evaluation Column <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={editingConfig.primaryKeyColumn || editingConfig.columns?.[0]?.columnName || ''}
                        onChange={(e) => {
                          const col = e.target.value;
                          setEditingConfig({
                            ...editingConfig,
                            primaryKeyColumn: col,
                            columns: [{ columnName: col, priority: 1, role: 'DISCRIMINATOR' }]
                          });
                        }}
                        className="w-full text-xs p-2 bg-white border border-emerald-300 rounded-lg font-mono font-bold text-emerald-950 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="">-- Select Column to Label & Evaluate --</option>
                        {previewColumns.map(c => (
                          <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-emerald-700 mt-1">Select the column whose constant values should be labeled and classified.</p>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-emerald-950 mb-1">
                        Unmapped / Unknown Value Action
                      </label>
                      <select
                        value={editingConfig.unmappedValueAction || 'FLAG'}
                        onChange={(e) => setEditingConfig({ ...editingConfig, unmappedValueAction: e.target.value as any })}
                        className="w-full text-xs p-2 bg-white border border-emerald-300 rounded-lg font-bold text-emerald-950 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="FLAG">FLAG as Violation (Unrecognized constant value)</option>
                        <option value="ALLOW">ALLOW (Accept unmapped values without error)</option>
                        <option value="IGNORE">IGNORE (Skip rows with unmapped values)</option>
                      </select>
                      <p className="text-[10px] text-emerald-700 mt-1">What to do when a row has a column value that was not labeled.</p>
                    </div>
                  </div>

                  {/* Labeled Values List */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-emerald-950">
                        Value Interpretations & Business Labels ({(editingConfig.valueLabels || []).length})
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const updated = [...(editingConfig.valueLabels || [])];
                          updated.push({
                            value: '',
                            label: '',
                            category: 'VALID',
                            description: ''
                          });
                          setEditingConfig({ ...editingConfig, valueLabels: updated });
                        }}
                        className="text-[11px] text-emerald-700 hover:text-emerald-900 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Custom Constant Value
                      </button>
                    </div>

                    {(editingConfig.valueLabels || []).length === 0 ? (
                      <div className="p-4 bg-white/70 border border-dashed border-emerald-300 rounded-lg text-center space-y-2">
                        <p className="text-xs text-emerald-800">No value mappings defined yet.</p>
                        <p className="text-[11px] text-emerald-600">
                          Click <strong>"Scan & Collect Unique Values"</strong> above to auto-detect constants from sample table data, or add custom constants manually.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {(editingConfig.valueLabels || []).map((vl, vlIdx) => (
                          <div key={vlIdx} className="p-2.5 bg-white border border-emerald-200 rounded-lg shadow-2xs space-y-2">
                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                              {/* Constant Value */}
                              <div className="sm:col-span-3">
                                <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">Constant Value</label>
                                <input
                                  type="text"
                                  value={vl.value}
                                  onChange={(e) => {
                                    const updated = [...(editingConfig.valueLabels || [])];
                                    updated[vlIdx] = { ...updated[vlIdx], value: e.target.value };
                                    setEditingConfig({ ...editingConfig, valueLabels: updated });
                                  }}
                                  placeholder="e.g. 00, DR, SUCCESS"
                                  className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                              </div>

                              {/* What to say about it (Label) */}
                              <div className="sm:col-span-5">
                                <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">What to Say About This Row (Label / Meaning)</label>
                                <input
                                  type="text"
                                  value={vl.label}
                                  onChange={(e) => {
                                    const updated = [...(editingConfig.valueLabels || [])];
                                    updated[vlIdx] = { ...updated[vlIdx], label: e.target.value };
                                    setEditingConfig({ ...editingConfig, valueLabels: updated });
                                  }}
                                  placeholder="e.g. Approved / Successful Authorization"
                                  className="w-full text-xs p-1.5 bg-slate-50 border border-slate-200 rounded font-semibold text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                />
                              </div>

                              {/* Category / Status */}
                              <div className="sm:col-span-3">
                                <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">Status Category</label>
                                <select
                                  value={vl.category || 'VALID'}
                                  onChange={(e) => {
                                    const updated = [...(editingConfig.valueLabels || [])];
                                    updated[vlIdx] = { ...updated[vlIdx], category: e.target.value as any };
                                    setEditingConfig({ ...editingConfig, valueLabels: updated });
                                  }}
                                  className={`w-full text-xs p-1.5 rounded font-bold border ${
                                    vl.category === 'ERROR' ? 'bg-red-50 text-red-700 border-red-200' :
                                    vl.category === 'WARNING' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                    vl.category === 'INFO' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                    'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  }`}
                                >
                                  <option value="VALID">VALID (Normal state)</option>
                                  <option value="WARNING">WARNING (Soft flag)</option>
                                  <option value="ERROR">ERROR (Violation flag)</option>
                                  <option value="INFO">INFO (Notice)</option>
                                </select>
                              </div>

                              {/* Delete button */}
                              <div className="sm:col-span-1 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = (editingConfig.valueLabels || []).filter((_, i) => i !== vlIdx);
                                    setEditingConfig({ ...editingConfig, valueLabels: updated });
                                  }}
                                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                                  title="Remove this value mapping"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Optional Description */}
                            <div className="pt-1 border-t border-slate-100 flex items-center gap-2">
                              <span className="text-[9px] font-bold uppercase text-slate-400 shrink-0">Note / Desc:</span>
                              <input
                                type="text"
                                value={vl.description || ''}
                                onChange={(e) => {
                                  const updated = [...(editingConfig.valueLabels || [])];
                                  updated[vlIdx] = { ...updated[vlIdx], description: e.target.value };
                                  setEditingConfig({ ...editingConfig, valueLabels: updated });
                                }}
                                placeholder="Optional context or instructions for this row when value matches..."
                                className="w-full text-[11px] p-1 bg-slate-50/70 border border-slate-200 rounded text-slate-600 focus:bg-white focus:outline-none"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* SECTION D: VIOLATION ACTION & GOVERNANCE */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Violation Action & Severity
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Pipeline Action on Violation
                    </label>
                    <select
                      value={editingConfig.violationAction}
                      onChange={(e) => setEditingConfig({ ...editingConfig, violationAction: e.target.value as any })}
                      className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                    >
                      <option value="FLAG">FLAG (Mark for Technical Investigation)</option>
                      <option value="STOP">STOP (Halt Pipeline Execution Immediately)</option>
                      <option value="CONTINUE">CONTINUE (Log Warning and Continue)</option>
                      <option value="REPORT">REPORT (Generate Exception File)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Severity Level
                    </label>
                    <select
                      value={editingConfig.severity}
                      onChange={(e) => setEditingConfig({ ...editingConfig, severity: e.target.value as any })}
                      className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                    >
                      <option value="CRITICAL">CRITICAL</option>
                      <option value="WARNING">WARNING</option>
                      <option value="INFO">INFO</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Custom Violation Message
                  </label>
                  <input
                    type="text"
                    value={editingConfig.violationMessage || ''}
                    onChange={(e) => setEditingConfig({ ...editingConfig, violationMessage: e.target.value })}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g. Duplicate transaction found across priority columns: {key}"
                  />
                </div>
              </div>

              {/* LIVE TRIAL RUN BUTTON INSIDE MODAL */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800">Test Rule on Live Sample Data</span>
                  <p className="text-[11px] text-slate-500">Evaluates current rule configuration against the {previewRows.length} loaded sample records.</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleTestRule(editingConfig)}
                  disabled={isTesting || previewRows.length === 0}
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <Play className={`w-3 h-3 ${isTesting ? 'animate-spin' : ''}`} />
                  <span>{isTesting ? 'Testing...' : 'Test on Live Data'}</span>
                </button>
              </div>

              {/* INLINE TEST RESULTS ACCORDION INSIDE MODAL */}
              {testResult && (
                <div className="p-3 bg-slate-100 border border-slate-300 rounded-xl space-y-2.5 animate-fadeIn">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {testResult.verdict === 'PASS' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <AlertOctagon className="w-4 h-4 text-rose-600" />
                      )}
                      <span className="text-xs font-bold text-slate-800">
                        {testResult.verdict === 'PASS' ? 'Trial Run Passed (Zero Violations)' : `Trial Run: ${testResult.violationCount} Violation(s)`}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setTestResultFilter('PASSED')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                          testResultFilter === 'PASSED'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                        }`}
                      >
                        ✓ Passed ({testResult.passedCount ?? (testResult.totalRows - testResult.violationCount)})
                      </button>

                      {testResult.violationCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setTestResultFilter('VIOLATIONS')}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                            testResultFilter === 'VIOLATIONS'
                              ? 'bg-rose-600 text-white'
                              : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                          }`}
                        >
                          ⚠ Violations ({testResult.violationCount})
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setTestResultFilter('ALL')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                          testResultFilter === 'ALL'
                            ? 'bg-slate-700 text-white'
                            : 'bg-white text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        All ({testResult.totalRows})
                      </button>
                    </div>
                  </div>

                  {/* Inline table */}
                  <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-48 bg-white">
                    <table className="w-full text-left text-xs divide-y divide-slate-100 font-sans">
                      <thead className="bg-slate-50 text-[10px] uppercase font-bold text-slate-500 sticky top-0">
                        <tr>
                          <th className="px-2.5 py-1.5 w-12 text-center">Row</th>
                          <th className="px-2.5 py-1.5 w-20 text-center">Status</th>
                          <th className="px-2.5 py-1.5">Meaning / Info / Violation Detail</th>
                          <th className="px-2.5 py-1.5">Values</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px] font-mono">
                        {(testResultFilter === 'ALL' || testResultFilter === 'VIOLATIONS') && testResult.violations.map((v, i) => (
                          <tr key={`m-viol-${i}`} className="bg-rose-50/25 hover:bg-rose-50/50">
                            <td className="px-2.5 py-1 text-center text-slate-500 font-sans">{v.rowIndex + 1}</td>
                            <td className="px-2.5 py-1 text-center font-sans">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-800">
                                FAIL
                              </span>
                            </td>
                            <td className="px-2.5 py-1 text-rose-700 font-sans font-medium">{v.reason}</td>
                            <td className="px-2.5 py-1 text-slate-600 text-[10px]">
                              {JSON.stringify(v.matchedPriorityValues)}
                            </td>
                          </tr>
                        ))}

                        {(testResultFilter === 'ALL' || testResultFilter === 'PASSED') && (testResult.passedRows || []).map((p, i) => (
                          <tr key={`m-pass-${i}`} className="bg-emerald-50/25 hover:bg-emerald-50/50">
                            <td className="px-2.5 py-1 text-center text-slate-500 font-sans">{p.rowIndex + 1}</td>
                            <td className="px-2.5 py-1 text-center font-sans">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">
                                PASS
                              </span>
                            </td>
                            <td className="px-2.5 py-1 text-emerald-800 font-sans font-medium">{p.info || 'Satisfied'}</td>
                            <td className="px-2.5 py-1 text-slate-600 text-[10px]">
                              {JSON.stringify(p.matchedPriorityValues)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Modal Footer */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingConfig(null);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSaving ? 'Saving...' : 'Save Configuration'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
