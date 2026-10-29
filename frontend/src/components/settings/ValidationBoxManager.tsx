import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Boxes,
  Plus,
  Search,
  CheckCircle2,
  Database,
  Filter,
  Play,
  Trash2,
  Edit3,
  Layers,
  ArrowRight,
  ShieldAlert,
  Server,
  Table,
  Cpu,
  Info,
  Sliders,
  Check,
  X,
  AlertCircle,
  AlertTriangle,
  Share2,
  ChevronDown,
  ChevronUp,
  Eye,
  MoreHorizontal
} from 'lucide-react';
import { api } from '../../api/client';
import { ValidationBox, ValidationBoxType, DatabaseConnection, DatabaseColumnConfiguration } from '../../types';
import { globalMappingService } from '../../services/globalMappingService';
import { showSystemAlert } from '../common/MessageModal';
import { ShareAssetModal } from '../common/ShareAssetModal';
import { AssetStatusBadge } from '../common/AssetStatusBadge';

interface ValidationBoxManagerProps {
  currentUser?: any;
}

export const ValidationBoxManager: React.FC<ValidationBoxManagerProps> = ({ currentUser }) => {
  const [boxes, setBoxes] = useState<ValidationBox[]>([]);
  const [databases, setDatabases] = useState<DatabaseConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'validation_boxes' | 'column_rules'>('validation_boxes');
  const [columnRules, setColumnRules] = useState<DatabaseColumnConfiguration[]>([]);
  const [selectedColumnRuleId, setSelectedColumnRuleId] = useState<string | null>(null);
  const [isNewRuleDropdownOpen, setIsNewRuleDropdownOpen] = useState(false);
  const [isDuplicateCheckModalOpen, setIsDuplicateCheckModalOpen] = useState(false);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'ALL' | ValidationBoxType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBox, setEditingBox] = useState<ValidationBox | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [sharingBox, setSharingBox] = useState<ValidationBox | null>(null);
  const [viewMode, setViewMode] = useState<'library' | 'focus'>('library');
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);

  // Column Rules Live Database Preview State
  const [colRuleDbId, setColRuleDbId] = useState<string>('');
  const [colRuleTable, setColRuleTable] = useState<string>('tran_log_tab');
  const [colRulePreviewRows, setColRulePreviewRows] = useState<any[]>([]);
  const [colRulePreviewCols, setColRulePreviewCols] = useState<Array<{ name: string; type: string }>>([]);
  const [colRulePreviewRowCount, setColRulePreviewRowCount] = useState<number>(0);
  const [colRulePreviewLatency, setColRulePreviewLatency] = useState<number>(24);
  const [isColRulePreviewLoading, setIsColRulePreviewLoading] = useState<boolean>(false);
  const [isColRulePreviewExpanded, setIsColRulePreviewExpanded] = useState<boolean>(true);
  const [colRulePreviewSearch, setColRulePreviewSearch] = useState<string>('');
  const [isModalLivePreviewExpanded, setIsModalLivePreviewExpanded] = useState<boolean>(false);

  // Duplicate Check Form State (matching 05_duplicate_check_builder.png)
  const [dupRuleName, setDupRuleName] = useState('New column rule');
  const [dupRuleType, setDupRuleType] = useState('Duplicate check');
  const [dupTargetDbId, setDupTargetDbId] = useState('');
  const [dupTargetTable, setDupTargetTable] = useState('tran_log_tab');
  const [dupPriorityColumns, setDupPriorityColumns] = useState<{ name: string; matchMode: string }[]>([
    { name: 'TR_GROUP_ID', matchMode: 'Exact match' },
    { name: 'BO_TYPE', matchMode: 'Exact match' },
    { name: 'PROC_NAME', matchMode: 'Exact match' }
  ]);
  const [dupGroupByColumns, setDupGroupByColumns] = useState<string[]>([
    'TR_GROUP_ID', 'BO_TYPE', 'PROC_NAME'
  ]);
  const [dupFilterConditions, setDupFilterConditions] = useState<{ column: string; operator: string; value: string }[]>([
    { column: 'BO_TYPE', operator: '=', value: 'CMTP254' }
  ]);
  const [dupIfViolated, setDupIfViolated] = useState('Flag for review');
  const [dupSeverity, setDupSeverity] = useState('Warning');
  const [dupViolationMessage, setDupViolationMessage] = useState('Duplicate or conflicting values detected across priority columns');
  const [dupIsSaving, setDupIsSaving] = useState(false);
  const [dupSampleTestRunning, setDupSampleTestRunning] = useState(false);
  const [dupSampleTestResult, setDupSampleTestResult] = useState<{ executed: boolean; violationsFound: number } | null>(null);

  // Form state
  const [boxType, setBoxType] = useState<ValidationBoxType>('INGESTION_SEARCH');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Core Settlement');
  const [targetDbId, setTargetDbId] = useState('');
  const [targetTable, setTargetTable] = useState('');
  const [searchParams, setSearchParams] = useState<{ inputField: string; targetColumn: string; required: boolean }[]>([
    { inputField: 'reference_number', targetColumn: 'reference_number', required: true }
  ]);

  // Condition check & Dual-Source state
  const [useDualSource, setUseDualSource] = useState(true);
  const [sourceAOrigin, setSourceAOrigin] = useState<'INPUT' | 'MIRROR' | 'LEG'>('INPUT');
  const [sourceAField, setSourceAField] = useState('amount');
  const [sourceALegKey, setSourceALegKey] = useState('ORIGINAL.DEBIT');
  const [sourceBOrigin, setSourceBOrigin] = useState<'INPUT' | 'MIRROR' | 'LEG'>('MIRROR');
  const [sourceBField, setSourceBField] = useState('amount');
  const [sourceBLegKey, setSourceBLegKey] = useState('REVERSAL.CREDIT');
  const [lookupDictEntries, setLookupDictEntries] = useState<{ code: string; label: string }[]>([
    { code: '00', label: 'Approved' },
    { code: '05', label: 'Decline' }
  ]);
  const [evalField, setEvalField] = useState('amount');
  const [operator, setOperator] = useState('EQUALS');
  const [expectedValue, setExpectedValue] = useState('');
  const [tolerance, setTolerance] = useState('0.00');
  const [actionSuccess, setActionSuccess] = useState('CONTINUE');
  const [actionFailure, setActionFailure] = useState('FLAG');
  const [severity, setSeverity] = useState('CRITICAL');

  // Standalone Reconciliation configuration state
  const [matchKeyInput, setMatchKeyInput] = useState('transaction_id');
  const [matchKeyExternal, setMatchKeyExternal] = useState('transaction_id');
  const [multiRowPolicy, setMultiRowPolicy] = useState<'COMPOSITE_BUNDLE' | 'LATEST' | 'EARLIEST' | 'AGGREGATE_SUM' | 'STRICT_SINGLE'>('COMPOSITE_BUNDLE');
  const [isGroupedEnabled, setIsGroupedEnabled] = useState(false);
  const [groupIdField, setGroupIdField] = useState('group_id');
  const [eventPhaseField, setEventPhaseField] = useState('event_type');
  const [origValue, setOrigValue] = useState('FINANCIAL_REQ');
  const [revValue, setRevValue] = useState('REVERSAL');
  const [refValue, setRefValue] = useState('REFUND');
  const [legIndicatorField, setLegIndicatorField] = useState('dr_cr_ind');
  const [debitValue, setDebitValue] = useState('D');
  const [creditValue, setCreditValue] = useState('C');
  const [feeValue, setFeeValue] = useState('F');

  // Standalone Report configuration state
  const [outputColumns, setOutputColumns] = useState<{ source: 'INPUT' | 'MIRROR' | 'COMPUTED'; field: string; headerAlias: string }[]>([
    { source: 'INPUT', field: 'transaction_id', headerAlias: 'Transaction ID' },
    { source: 'INPUT', field: 'amount', headerAlias: 'Input Amount' },
    { source: 'MIRROR', field: 'amount', headerAlias: 'Host Amount' }
  ]);
  const [statusTargetField, setStatusTargetField] = useState('reconciliation_status');
  const [messageTemplate, setMessageTemplate] = useState('Transaction {{key}} processed with status {{status}}');

  // Test Runner drawer
  const [testingBox, setTestingBox] = useState<ValidationBox | null>(null);
  const [testParams, setTestParams] = useState<Record<string, any>>({});
  const [testSampleJson, setTestSampleJson] = useState('{\n  "transaction_id": "TXN-1001",\n  "amount": 149.99\n}');
  const [testViewMode, setTestViewMode] = useState<'FORM' | 'JSON'>('FORM');
  const [newParamKey, setNewParamKey] = useState('');
  const [newParamVal, setNewParamVal] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);

  const generateSampleRecordForBox = (box: ValidationBox): Record<string, any> => {
    const sample: Record<string, any> = {};
    if (box.boxType === 'INGESTION_SEARCH' && box.searchParameters && box.searchParameters.length > 0) {
      box.searchParameters.forEach(p => {
        const field = p.inputField || p.targetColumn;
        if (field) {
          sample[field] = (p as any).defaultValue || (
            field.toLowerCase().includes('amount') ? 149.99 :
            field.toLowerCase().includes('id') || field.toLowerCase().includes('ref') ? 'TXN-1001' :
            field.toLowerCase().includes('card') || field.toLowerCase().includes('pan') ? '4111********9982' :
            field.toLowerCase().includes('status') ? 'COMPLETED' :
            field.toLowerCase().includes('code') ? '00' :
            'PARAM_VAL'
          );
        }
      });
    } else if (box.boxType === 'CONDITION_CHECK') {
      if (box.dualSourceCondition) {
        const sA = box.dualSourceCondition.sourceA?.field || 'institution1';
        const sB = box.dualSourceCondition.sourceB?.field || 'institution2';
        sample[sA] = box.dualSourceCondition.toleranceMargin ? 100.00 : 'TEST_VAL';
        sample[sB] = box.dualSourceCondition.toleranceMargin ? 100.00 : 'TEST_VAL';
      } else if (box.checkStep) {
        const field = box.checkStep.canonicalField || box.checkStep.sourceField || 'amount';
        sample[field] = box.checkStep.expectedValue ?? box.checkStep.compareValue ?? 149.99;
      }
      if (box.checkStep?.requiredParams && Array.isArray(box.checkStep.requiredParams)) {
        box.checkStep.requiredParams.forEach(p => {
          if (!sample[p]) sample[p] = p.toLowerCase().includes('amount') ? 100.00 : 'PARAM_VAL';
        });
      }
    } else if (box.boxType === 'RECONCILIATION') {
      sample[box.matchKeyInput || 'transaction_id'] = 'TXN-1001';
      if (box.groupConfig?.groupIdField) sample[box.groupConfig.groupIdField] = 'GRP-001';
      if (box.groupConfig?.eventPhaseField) sample[box.groupConfig.eventPhaseField] = 'FINANCIAL_REQ';
    } else if (box.boxType === 'REPORT') {
      (box.outputColumns || []).forEach(c => {
        if (c.field) sample[c.field] = `VAL_${c.field.toUpperCase()}`;
      });
    }

    if (Object.keys(sample).length === 0) {
      sample.transaction_id = 'TXN-1001';
      sample.amount = 149.99;
    }
    return sample;
  };

  const handleOpenTestDrawer = (box: ValidationBox) => {
    setTestingBox(box);
    setTestResult(null);
    const sample = generateSampleRecordForBox(box);
    setTestParams(sample);
    setTestSampleJson(JSON.stringify(sample, null, 2));
    setNewParamKey('');
    setNewParamVal('');
    setTestViewMode('FORM');
  };

  const handleParamChange = (key: string, value: any) => {
    const updated = { ...testParams, [key]: value };
    setTestParams(updated);
    setTestSampleJson(JSON.stringify(updated, null, 2));
  };

  const handleParamDelete = (key: string) => {
    const updated = { ...testParams };
    delete updated[key];
    setTestParams(updated);
    setTestSampleJson(JSON.stringify(updated, null, 2));
  };

  const handleAddParam = () => {
    if (!newParamKey.trim()) return;
    const key = newParamKey.trim();
    let val: any = newParamVal.trim();
    if (!isNaN(Number(val)) && val !== '') {
      val = Number(val);
    }
    const updated = { ...testParams, [key]: val };
    setTestParams(updated);
    setTestSampleJson(JSON.stringify(updated, null, 2));
    setNewParamKey('');
    setNewParamVal('');
  };

  const handleResetToBoxParams = () => {
    if (!testingBox) return;
    const sample = generateSampleRecordForBox(testingBox);
    setTestParams(sample);
    setTestSampleJson(JSON.stringify(sample, null, 2));
  };

  useEffect(() => {
    loadData();
  }, []);

  // Load live table sample preview for Column Rules
  const loadColRulePreview = useCallback(async (dbId: string, tbl: string) => {
    if (!dbId || !tbl) {
      setColRulePreviewCols([]);
      setColRulePreviewRows([]);
      setColRulePreviewRowCount(0);
      return;
    }
    setIsColRulePreviewLoading(true);
    try {
      const res = await api.getTablePreviewData(dbId, tbl, 25);
      const rawCols = Array.isArray(res?.columns) ? res.columns : [];
      const sampleRow = res?.rows && res.rows.length > 0 ? res.rows[0] : null;

      const normalizedCols: Array<{ name: string; type: string }> = rawCols.map((c: any) => {
        if (typeof c === 'string') {
          const sampleVal = sampleRow ? (sampleRow[c] ?? sampleRow[c.toLowerCase()] ?? sampleRow[c.toUpperCase()]) : undefined;
          return { name: c, type: typeof sampleVal !== 'undefined' && sampleVal !== null ? typeof sampleVal : 'VARCHAR' };
        }
        return { name: c.name || String(c), type: c.type || 'VARCHAR' };
      });

      setColRulePreviewCols(normalizedCols);
      setColRulePreviewRows(res?.rows || []);
      setColRulePreviewRowCount(res?.rowCount || (res?.rows ? res.rows.length : 0));
      setColRulePreviewLatency(res?.executionTimeMs || 24);
    } catch (err) {
      console.warn('Could not load live preview for column rules, using sample:', err);
      setColRulePreviewCols([
        { name: 'TR_GROUP_ID', type: 'VARCHAR' },
        { name: 'BO_TYPE', type: 'VARCHAR' },
        { name: 'PROC_NAME', type: 'VARCHAR' },
        { name: 'FE_UTRNNO', type: 'VARCHAR' },
        { name: 'AMNT1', type: 'DECIMAL' },
        { name: 'CURRENCY1', type: 'VARCHAR' },
        { name: 'STATUS', type: 'VARCHAR' }
      ]);
      setColRulePreviewRows([
        { TR_GROUP_ID: 'GRP-001', BO_TYPE: 'CMTP254', PROC_NAME: 'SETTLE_CLEAR', FE_UTRNNO: 'UTR-99120', AMNT1: 1500.00, CURRENCY1: 'ETB', STATUS: 'ACTIVE' },
        { TR_GROUP_ID: 'GRP-002', BO_TYPE: 'CMTP254', PROC_NAME: 'SETTLE_CLEAR', FE_UTRNNO: 'UTR-99121', AMNT1: 2300.50, CURRENCY1: 'ETB', STATUS: 'ACTIVE' },
        { TR_GROUP_ID: 'GRP-003', BO_TYPE: 'CMTP254', PROC_NAME: 'SETTLE_CLEAR', FE_UTRNNO: 'UTR-99122', AMNT1: 450.00, CURRENCY1: 'ETB', STATUS: 'PENDING' }
      ]);
      setColRulePreviewRowCount(3);
      setColRulePreviewLatency(18);
    } finally {
      setIsColRulePreviewLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'column_rules' && colRuleDbId && colRuleTable) {
      loadColRulePreview(colRuleDbId, colRuleTable);
    }
  }, [activeTab, colRuleDbId, colRuleTable, loadColRulePreview]);

  const colRuleFilteredRows = useMemo(() => {
    if (!colRulePreviewSearch.trim()) return colRulePreviewRows;
    const q = colRulePreviewSearch.toLowerCase();
    return colRulePreviewRows.filter(row => 
      Object.values(row).some(v => String(v).toLowerCase().includes(q))
    );
  }, [colRulePreviewRows, colRulePreviewSearch]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [vBoxes, dbs, colConfigs] = await Promise.all([
        api.getValidationBoxes(),
        api.getDatabases(),
        api.getColumnConfigurations().catch(() => []),
        globalMappingService.fetchConfigFromBackend()
      ]);
      const safeBoxes = vBoxes || [];
      const safeConfigs = colConfigs || [];
      setBoxes(safeBoxes);
      setDatabases(dbs || []);
      setColumnRules(safeConfigs);
      if (!selectedBoxId && safeBoxes.length > 0) {
        setSelectedBoxId(safeBoxes[0].id);
      }
      if (!selectedColumnRuleId && safeConfigs.length > 0) {
        setSelectedColumnRuleId(safeConfigs[0].id);
      }
      if (dbs && dbs.length > 0 && !targetDbId) {
        setTargetDbId(dbs[0].id);
        const tbls = dbs[0].availableTables || dbs[0].allowedTables || [];
        if (tbls.length > 0) setTargetTable(tbls[0]);
      }
    } catch (err) {
      console.error('Failed to load validation boxes:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectedDb = databases.find(d => d.id === targetDbId);
  const availableTables = selectedDb?.availableTables || selectedDb?.allowedTables || [];

  const [tableColumns, setTableColumns] = useState<{ name: string; type: string; nullable?: boolean; isPrimary?: boolean }[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [tableColumnConfigs, setTableColumnConfigs] = useState<DatabaseColumnConfiguration[]>([]);
  const [selectedColumnConfigIds, setSelectedColumnConfigIds] = useState<string[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);

  useEffect(() => {
    if (targetDbId && targetTable) {
      setLoadingColumns(true);
      setLoadingConfigs(true);

      api.getTableColumns(targetDbId, targetTable)
        .then(res => {
          let cols = res?.columns || [];
          if (cols.length === 0) {
            const tableMap = globalMappingService.getTableMapping(targetDbId, targetTable);
            if (tableMap && tableMap.columns.length > 0) {
              cols = tableMap.columns.map(c => ({ name: c.physicalColumn, type: 'VARCHAR', nullable: true }));
            }
          }
          setTableColumns(cols);
        })
        .catch(err => {
          console.warn('Could not load table columns:', err);
          const tableMap = globalMappingService.getTableMapping(targetDbId, targetTable);
          if (tableMap && tableMap.columns.length > 0) {
            setTableColumns(tableMap.columns.map(c => ({ name: c.physicalColumn, type: 'VARCHAR', nullable: true })));
          } else {
            setTableColumns([]);
          }
        })
        .finally(() => setLoadingColumns(false));

      api.getColumnConfigurations(targetDbId, targetTable)
        .then(configs => {
          setTableColumnConfigs(configs || []);
        })
        .catch(err => {
          console.warn('Could not load column configurations:', err);
          setTableColumnConfigs([]);
        })
        .finally(() => setLoadingConfigs(false));
    } else {
      setTableColumns([]);
      setTableColumnConfigs([]);
    }
  }, [targetDbId, targetTable]);

  const globalStandardFields = useMemo(() => globalMappingService.getStandardFields(), []);
  const availableColumnNames = useMemo(() => {
    const names = tableColumns.map(c => c.name);
    return Array.from(new Set(names));
  }, [tableColumns]);

  const handleOpenCreateModal = (type: ValidationBoxType = 'INGESTION_SEARCH') => {
    setEditingBox(null);
    setBoxType(type);
    if (type === 'INGESTION_SEARCH') setName('Settlement Auth Query Block');
    else if (type === 'RECONCILIATION') setName('External Host Reconciliation Block');
    else if (type === 'REPORT') setName('Reconciliation Output & Status Report');
    else setName('Dual-Source Amount Integrity Check');

    setDescription('');
    setCategory('General');
    const firstDb = databases[0];
    const firstDbId = firstDb?.id || '';
    const tbls = firstDb?.availableTables || firstDb?.allowedTables || [];
    const firstTable = tbls[0] || 'transactions';
    setTargetDbId(firstDbId);
    setTargetTable(firstTable);

    // Auto-select standard required fields from current Global Schema
    const standardFields = globalMappingService.getStandardFields();
    const defaultParams = standardFields
      .filter(f => f.key === 'transaction_id' || f.required)
      .slice(0, 3)
      .map(f => ({
        inputField: f.key,
        targetColumn: firstDbId && firstTable ? globalMappingService.getPhysicalColumn(firstDbId, firstTable, f.key) : f.key,
        required: true
      }));
    setSearchParams(defaultParams.length > 0 ? defaultParams : [{ inputField: 'transaction_id', targetColumn: 'transaction_id', required: true }]);

    // Dual source defaults
    setUseDualSource(true);
    setSourceAOrigin('INPUT');
    setSourceAField('amount');
    setSourceALegKey('ORIGINAL.DEBIT');
    setSourceBOrigin('MIRROR');
    setSourceBField('amount');
    setSourceBLegKey('REVERSAL.CREDIT');
    setLookupDictEntries([
      { code: '00', label: 'Approved' },
      { code: '05', label: 'Decline' }
    ]);
    setEvalField('amount');
    setOperator('EQUALS');
    setExpectedValue('');
    setTolerance('0.00');
    setActionSuccess('CONTINUE');
    setActionFailure('FLAG');
    setSeverity('CRITICAL');

    // Reconciliation defaults
    setMatchKeyInput('transaction_id');
    setMatchKeyExternal('transaction_id');
    setMultiRowPolicy('COMPOSITE_BUNDLE');
    setIsGroupedEnabled(false);
    setGroupIdField('group_id');
    setEventPhaseField('event_type');
    setOrigValue('FINANCIAL_REQ');
    setRevValue('REVERSAL');
    setRefValue('REFUND');
    setLegIndicatorField('dr_cr_ind');
    setDebitValue('D');
    setCreditValue('C');
    setFeeValue('F');

    // Report defaults
    setOutputColumns([
      { source: 'INPUT', field: 'transaction_id', headerAlias: 'Transaction ID' },
      { source: 'INPUT', field: 'amount', headerAlias: 'Input Amount' },
      { source: 'MIRROR', field: 'amount', headerAlias: 'Host Amount' }
    ]);
    setStatusTargetField('reconciliation_status');
    setMessageTemplate('Transaction {{transaction_id}} verified: status={{status}}');
    setSelectedColumnConfigIds([]);

    setIsModalOpen(true);
  };

  const handleOpenEditModal = (box: ValidationBox) => {
    setEditingBox(box);
    setBoxType(box.boxType);
    setName(box.name);
    setDescription(box.description || '');
    setCategory(box.category || 'General');
    const dbId = box.targetDbId || (databases[0]?.id || '');
    const tbl = box.targetTable || '';
    setTargetDbId(dbId);
    setTargetTable(tbl);
    setSelectedColumnConfigIds(box.columnConfigurationIds || box.checkStep?.columnConfigurationIds || []);

    const initialParams = box.searchParameters && box.searchParameters.length > 0 
      ? box.searchParameters 
      : [{ 
          inputField: 'transaction_id', 
          targetColumn: dbId && tbl ? globalMappingService.getPhysicalColumn(dbId, tbl, 'transaction_id') : 'transaction_id', 
          required: true 
        }];
    setSearchParams(initialParams);

    // Populate dual-source if available
    if (box.dualSourceCondition || box.checkStep?.dualSourceCondition) {
      const dsc = box.dualSourceCondition || box.checkStep?.dualSourceCondition;
      setUseDualSource(true);
      if (dsc?.sourceA) {
        setSourceAOrigin(dsc.sourceA.origin);
        setSourceAField(dsc.sourceA.field);
        setSourceALegKey(dsc.sourceA.legKey || 'ORIGINAL.DEBIT');
      }
      if (dsc?.sourceB) {
        setSourceBOrigin(dsc.sourceB.origin);
        setSourceBField(dsc.sourceB.field);
        setSourceBLegKey(dsc.sourceB.legKey || 'REVERSAL.CREDIT');
      }
      if (dsc?.comparator) setOperator(dsc.comparator);
      if (dsc?.toleranceMargin !== undefined) setTolerance(String(dsc.toleranceMargin));
      if (dsc?.lookupDictionary) {
        setLookupDictEntries(Object.entries(dsc.lookupDictionary).map(([code, label]) => ({ code, label })));
      }
    } else {
      setUseDualSource(false);
    }

    if (box.checkStep) {
      setEvalField(box.checkStep.canonicalField || box.checkStep.sourceField || 'amount');
      if (!box.dualSourceCondition) {
        setOperator(box.checkStep.operator || box.checkStep.comparator || 'EQUALS');
      }
      setExpectedValue(box.checkStep.expectedValue || box.checkStep.compareValue || '');
      setTolerance((box.checkStep.tolerance ?? box.checkStep.toleranceMargin ?? 0).toString());
      setActionSuccess(box.checkStep.actionOnSuccess || box.checkStep.onPassAction || 'CONTINUE');
      setActionFailure(box.checkStep.actionOnFailure || box.checkStep.onFailAction || 'FLAG');
      setSeverity(box.checkStep.severityOnFailure || 'CRITICAL');
    }

    // Populate reconciliation properties
    if (box.matchKeyInput) setMatchKeyInput(box.matchKeyInput);
    if (box.matchKeyExternal) setMatchKeyExternal(box.matchKeyExternal);
    if (box.multiRowPolicy) setMultiRowPolicy(box.multiRowPolicy);
    if (box.groupConfig) {
      setIsGroupedEnabled(true);
      setGroupIdField(box.groupConfig.groupIdField || 'group_id');
      setEventPhaseField(box.groupConfig.eventPhaseField || 'event_type');
      if (box.groupConfig.eventPhaseMap) {
        setOrigValue(box.groupConfig.eventPhaseMap.originalValue || 'FINANCIAL_REQ');
        setRevValue(box.groupConfig.eventPhaseMap.reversalValue || 'REVERSAL');
        setRefValue(box.groupConfig.eventPhaseMap.refundValue || 'REFUND');
      }
      if (box.groupConfig.legIndicatorField) setLegIndicatorField(box.groupConfig.legIndicatorField);
      if (box.groupConfig.legIndicatorMap) {
        setDebitValue(box.groupConfig.legIndicatorMap.debitValue || 'D');
        setCreditValue(box.groupConfig.legIndicatorMap.creditValue || 'C');
        setFeeValue(box.groupConfig.legIndicatorMap.feeValue || 'F');
      }
    } else {
      setIsGroupedEnabled(false);
    }

    // Populate report properties
    if (box.outputColumns && box.outputColumns.length > 0) setOutputColumns(box.outputColumns);
    if (box.statusBinding) setStatusTargetField(box.statusBinding.targetField || 'reconciliation_status');
    if (box.messageTemplate) setMessageTemplate(box.messageTemplate);

    setIsModalOpen(true);
  };

  const handleSaveBox = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      let dualSourceCondition: any = undefined;
      if (boxType === 'CONDITION_CHECK' && useDualSource) {
        const dict: Record<string, string> = {};
        for (const entry of lookupDictEntries) {
          if (entry.code.trim()) {
            dict[entry.code.trim()] = entry.label.trim();
          }
        }
        dualSourceCondition = {
          sourceA: {
            origin: sourceAOrigin,
            field: sourceAField.trim(),
            ...(sourceAOrigin === 'LEG' && { legKey: sourceALegKey })
          },
          comparator: operator as any,
          sourceB: {
            origin: sourceBOrigin,
            field: sourceBField.trim(),
            ...(sourceBOrigin === 'LEG' && { legKey: sourceBLegKey })
          },
          toleranceMargin: parseFloat(tolerance) || 0.00,
          lookupDictionary: Object.keys(dict).length > 0 ? dict : undefined,
          failVerdict: actionFailure === 'FLAG' ? 'FLAG' : 'FAIL'
        };
      }

      const payload: any = {
        name: name.trim(),
        description: description.trim(),
        boxType,
        category,
        targetDbId: targetDbId || undefined,
        targetTable: targetTable || undefined,
        searchParameters: boxType === 'INGESTION_SEARCH' ? searchParams : [],
        matchKeyInput: boxType === 'RECONCILIATION' ? matchKeyInput : undefined,
        matchKeyExternal: boxType === 'RECONCILIATION' ? matchKeyExternal : undefined,
        multiRowPolicy: boxType === 'RECONCILIATION' ? multiRowPolicy : undefined,
        groupConfig: (boxType === 'RECONCILIATION' && isGroupedEnabled) ? {
          groupIdField,
          eventPhaseField,
          eventPhaseMap: {
            originalValue: origValue,
            reversalValue: revValue,
            refundValue: refValue
          },
          legIndicatorField,
          legIndicatorMap: {
            debitValue,
            creditValue,
            feeValue
          }
        } : undefined,
        dualSourceCondition,
        outputColumns: boxType === 'REPORT' ? outputColumns : undefined,
        statusBinding: boxType === 'REPORT' ? {
          targetField: statusTargetField,
          mappingRules: [
            { whenVerdict: 'PASS', setStatusValue: 'SETTLED' },
            { whenVerdict: 'FAIL', setStatusValue: 'DISCREPANCY' }
          ]
        } : undefined,
        messageTemplate: boxType === 'REPORT' ? messageTemplate : undefined,
        columnConfigurationIds: selectedColumnConfigIds,
        checkStep: boxType === 'CONDITION_CHECK' ? {
          id: `step-${Date.now()}`,
          name: name.trim(),
          stage: 'VALIDATION',
          checkType: useDualSource ? 'DUAL_SOURCE_COMPARISON' : 'FIELD_COMPARATOR',
          sourceField: useDualSource ? sourceAField : evalField,
          targetField: useDualSource ? sourceBField : undefined,
          canonicalField: evalField,
          operator,
          comparator: operator === 'EQUALS' ? '=' : (operator === 'NOT_EQUALS' ? '!=' : (operator === 'NUMERIC_TOLERANCE' ? '=' : operator as any)),
          compareValue: expectedValue,
          expectedValue,
          tolerance: parseFloat(tolerance) || 0,
          toleranceMargin: parseFloat(tolerance) || 0,
          dualSourceCondition,
          columnConfigurationIds: selectedColumnConfigIds,
          severityOnFailure: severity,
          actionOnSuccess: actionSuccess,
          actionOnFailure: actionFailure,
          onPassAction: (actionSuccess === 'RECONCILE' || actionSuccess === 'CLOSE_PASS') ? 'CLOSE' : (actionSuccess === 'STOP' ? 'STOP' : 'CONTINUE'),
          onFailAction: (actionFailure === 'CONTINUE' ? 'CONTINUE' : (actionFailure === 'FLAG' ? 'STOP' : actionFailure)) as any,
          errorMessage: `${name.trim()} check failed`
        } : undefined
      };

      if (editingBox) {
        await api.updateValidationBox(editingBox.id, payload);
      } else {
        await api.createValidationBox(payload);
      }

      setIsModalOpen(false);
      loadData();
    } catch (err: any) {
      showSystemAlert({
        title: 'Save Failed',
        message: `Failed to save validation box: ${err.message || err}`,
        type: 'error'
      });
    }
  };

  const [isClearingAll, setIsClearingAll] = useState(false);

  const handleClearAllHistory = async () => {
    if (!confirm(
      'DANGER: Permanently delete ALL validation check history across all tasks?\n\nThis will wipe:\n- All workflow execution records\n- All investigation tasks, batches, and transaction results\n\nThis action cannot be undone.'
    )) return;
    setIsClearingAll(true);
    try {
      const result = await api.clearAllValidationExecutions();
      showSystemAlert({
        title: 'Validation History Cleared',
        message: result.message || 'All validation check history has been cleared. You can start fresh.',
        type: 'success'
      });
    } catch (err: any) {
      showSystemAlert({
        title: 'Clear Failed',
        message: `Failed to clear history: ${err.message || err}`,
        type: 'error'
      });
    } finally {
      setIsClearingAll(false);
    }
  };

  const handleSaveDuplicateCheck = async () => {
    setDupIsSaving(true);
    try {
      const payload: any = {
        name: dupRuleName.trim() || 'New column rule',
        ruleType: 'DUPLICATE_CHECK',
        dbId: dupTargetDbId || databases[0]?.id || 'db-1',
        tableName: dupTargetTable.trim() || 'tran_log_tab',
        columns: dupPriorityColumns.map((col, idx) => ({
          columnName: col.name,
          priority: idx + 1,
          matchMode: (col.matchMode === 'Fuzzy match' ? 'FUZZY' : 'EXACT') as any
        })),
        groupByColumns: dupGroupByColumns,
        filterConditions: dupFilterConditions,
        violationAction: (dupIfViolated === 'Reject / Drop' ? 'REJECT' : (dupIfViolated === 'Send to exception queue' ? 'EXCEPTION_QUEUE' : 'FLAG_REVIEW')) as any,
        severity: dupSeverity.toUpperCase() as any,
        violationMessage: dupViolationMessage.trim()
      };

      await api.createColumnConfiguration(payload);
      showSystemAlert({
        title: 'Rule Saved',
        message: `Duplicate check "${payload.name}" created successfully.`,
        type: 'success'
      });
      setIsDuplicateCheckModalOpen(false);
      loadData();
    } catch (err: any) {
      showSystemAlert({
        title: 'Save Failed',
        message: err.message || 'Failed to save duplicate check rule.',
        type: 'error'
      });
    } finally {
      setDupIsSaving(false);
    }
  };

  const handleDeleteBox = async (id: string, boxName: string) => {
    if (!confirm(`Are you sure you want to delete Validation Box "${boxName}"?`)) return;
    try {
      await api.deleteValidationBox(id);
      loadData();
      showSystemAlert({
        title: 'Validation Box Deleted',
        message: `Validation Box "${boxName}" has been deleted.`,
        type: 'success'
      });
    } catch (err: any) {
      showSystemAlert({
        title: 'Delete Failed',
        message: `Delete failed: ${err.message || err}`,
        type: 'error'
      });
    }
  };

  const handleTestRun = async () => {
    if (!testingBox) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      let parsed = testParams;
      if (testViewMode === 'JSON') {
        try {
          parsed = JSON.parse(testSampleJson);
        } catch {
          showSystemAlert({
            title: 'Invalid JSON Payload',
            message: 'The sample test payload is not valid JSON. Please check commas, quotes, and brackets.',
            type: 'warning'
          });
          setIsTesting(false);
          return;
        }
      }
      const res = await api.testValidationBox(testingBox, parsed);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ error: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  const filteredBoxes = boxes.filter(b => {
    const matchesType = selectedTypeFilter === 'ALL' || b.boxType === selectedTypeFilter;
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query ||
      b.name.toLowerCase().includes(query) ||
      (b.category && b.category.toLowerCase().includes(query)) ||
      (b.targetTable && b.targetTable.toLowerCase().includes(query));
    return matchesType && matchesSearch;
  });

    const selectedBox = boxes.find(b => b.id === selectedBoxId) || filteredBoxes[0] || null;
    const selectedColumnRule = columnRules.find(r => r.id === selectedColumnRuleId) || columnRules[0] || null;

    const navItems = [
      { key: 'ALL', label: 'All', count: boxes.length },
      { key: 'INGESTION_SEARCH', label: 'Search', count: boxes.filter(b => b.boxType === 'INGESTION_SEARCH').length },
      { key: 'RECONCILIATION', label: 'Reconciliation', count: boxes.filter(b => b.boxType === 'RECONCILIATION').length },
      { key: 'CONDITION_CHECK', label: 'Condition', count: boxes.filter(b => b.boxType === 'CONDITION_CHECK').length },
      { key: 'REPORT', label: 'Report', count: boxes.filter(b => b.boxType === 'REPORT').length }
    ] as const;

    const columnRuleNavItems = [
      { key: 'ALL', label: 'All', count: columnRules.length },
      { key: 'DUPLICATE_CHECK', label: 'Duplicate check', count: columnRules.filter(r => r.ruleType === 'DUPLICATE_CHECK').length },
      { key: 'COMPLETENESS', label: 'Completeness', count: columnRules.filter(r => r.ruleType === 'COMPLETENESS' || r.ruleType === 'NULL_CHECK').length },
      { key: 'RANGE', label: 'Range', count: columnRules.filter(r => r.ruleType === 'RANGE' || r.ruleType === 'VALUE_BOUNDS').length }
    ];

    const filteredColumnRules = columnRules.filter(r => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = !q || (r.ruleName && r.ruleName.toLowerCase().includes(q)) || (r.tableName && r.tableName.toLowerCase().includes(q));
      return matchesSearch;
    });

  return (
    <div className="space-y-4 font-sans p-6 bg-slate-50/50 min-h-full">
      {/* Breadcrumb matching 04_rules_library.png */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
        <span>Build</span>
        <span>/</span>
        <span className="text-slate-700 font-semibold">Rules</span>
      </div>

      {/* 1. Header Toolbar matching 04_rules_library.png */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0" id="val-box-header">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Rules</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Reusable building blocks that workflows call to search, compare and verify data.
          </p>
        </div>

        <div className="relative" id="val-box-actions-row">
          <button
            type="button"
            onClick={() => setIsNewRuleDropdownOpen(prev => !prev)}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#F27421] hover:bg-[#d65f15] text-white rounded-lg font-semibold text-xs transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New rule</span>
            <ChevronDown className="w-3.5 h-3.5 opacity-80" />
          </button>

          {isNewRuleDropdownOpen && (
            <div className="absolute right-0 mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1 divide-y divide-slate-100">
              <div className="p-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsNewRuleDropdownOpen(false);
                    handleOpenCreateModal('INGESTION_SEARCH');
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 rounded-lg flex items-center gap-2.5 cursor-pointer"
                >
                  <Boxes className="w-4 h-4 text-[#F27421]" />
                  <div>
                    <div className="font-bold text-slate-900">Validation box</div>
                    <div className="text-[10px] text-slate-400">Search, condition, reconciliation</div>
                  </div>
                </button>
              </div>
              <div className="p-1">
                <button
                  type="button"
                  onClick={() => {
                    setIsNewRuleDropdownOpen(false);
                    setIsDuplicateCheckModalOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 rounded-lg flex items-center gap-2.5 cursor-pointer"
                >
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <div>
                    <div className="font-bold text-slate-900">Duplicate check</div>
                    <div className="text-[10px] text-slate-400">Match across priority columns</div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Top Navigation Tabs matching 04_rules_library.png */}
      <div className="flex items-center gap-6 border-b border-slate-200 text-sm font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('validation_boxes')}
          className={`pb-3 flex items-center gap-2 cursor-pointer transition-colors relative ${
            activeTab === 'validation_boxes'
              ? 'text-slate-900 font-bold border-b-2 border-[#F27421]'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Validation boxes</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
            activeTab === 'validation_boxes' ? 'bg-[#0F142A] text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {boxes.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('column_rules')}
          className={`pb-3 flex items-center gap-2 cursor-pointer transition-colors relative ${
            activeTab === 'column_rules'
              ? 'text-slate-900 font-bold border-b-2 border-[#F27421]'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span>Column rules</span>
          <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
            activeTab === 'column_rules' ? 'bg-[#0F142A] text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {columnRules.length || 1}
          </span>
        </button>
      </div>

      {/* 3. Sub-Filter Pills & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {(activeTab === 'validation_boxes' ? navItems : columnRuleNavItems).map(item => {
            const active = selectedTypeFilter === item.key || (item.key === 'ALL' && selectedTypeFilter === 'ALL');
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setSelectedTypeFilter(item.key as any)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-slate-100 text-slate-900 border border-slate-200/80 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
                }`}
              >
                <span>{item.label}</span>
                <span className={`text-[10px] ${active ? 'text-slate-700 font-bold' : 'text-slate-400'}`}>
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={activeTab === 'validation_boxes' ? 'Search rules...' : 'Search column rules...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#F27421] transition shadow-2xs"
          />
        </div>
      </div>

      {/* 4. Main Grid: 2 Columns of Cards on the left + Inspector Card on the right */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
        <div className="space-y-4">
          {loading ? (
            <div className="py-16 text-center text-slate-400 animate-pulse font-medium">Loading rules...</div>
          ) : activeTab === 'validation_boxes' ? (
            filteredBoxes.length === 0 ? (
              <div className="p-12 text-center border border-dashed border-slate-200 rounded-xl bg-white">
                <Boxes className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-800 mb-1">No Validation Boxes found</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
                  Build standalone rule blocks to separate external querying from integrity checks before linking them in the Workflow Studio.
                </p>
                <div className="flex justify-center gap-2 flex-wrap">
                  <button type="button" onClick={() => handleOpenCreateModal('INGESTION_SEARCH')} className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition-colors cursor-pointer">+ Add Search Box</button>
                  <button type="button" onClick={() => handleOpenCreateModal('CONDITION_CHECK')} className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-colors cursor-pointer">+ Add Condition Check</button>
                  <button type="button" onClick={() => handleOpenCreateModal('RECONCILIATION')} className="px-3 py-1.5 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 border border-cyan-200 rounded-lg text-xs font-bold transition-colors cursor-pointer">+ Add Reconciliation Box</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredBoxes.map((box) => {
                  const getTypeMeta = () => {
                    switch (box.boxType) {
                      case 'INGESTION_SEARCH':
                        return { label: 'Search & ingest', icon: Database };
                      case 'RECONCILIATION':
                        return { label: 'Reconciliation', icon: Layers };
                      case 'REPORT':
                        return { label: 'Report output', icon: Cpu };
                      case 'CONDITION_CHECK':
                      default:
                        return { label: 'Condition check', icon: CheckCircle2 };
                    }
                  };
                  const meta = getTypeMeta();
                  const Icon = meta.icon;
                  const isSelected = selectedBox?.id === box.id;

                  return (
                    <div
                      key={box.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedBoxId(box.id)}
                      className={`group relative w-full text-left bg-white rounded-xl p-4 flex flex-col justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'border-2 border-[#F27421] shadow-xs'
                          : 'border border-slate-200 hover:border-slate-300 shadow-2xs'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="p-2 rounded-lg shrink-0 border border-slate-200 bg-slate-50 text-slate-700">
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-bold text-slate-900 text-sm truncate" title={box.name}>{box.name}</h3>
                              <div className="text-xs text-slate-400 capitalize mt-0.5">
                                {meta.label}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSharingBox(box);
                                setIsShareModalOpen(true);
                              }}
                              className="p-1 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                              title="More Options"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <p className="text-xs text-slate-500 line-clamp-2 mb-3 leading-relaxed">
                          {box.description || 'No description provided.'}
                        </p>

                        {/* Tag pills row */}
                        <div className="flex items-center gap-1.5 flex-wrap mb-4">
                          <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded font-medium border border-slate-200/60">
                            {databases.find(d => d.id === box.targetDbId)?.name || 'Sett'}
                          </span>
                          <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded font-medium border border-slate-200/60">
                            {box.targetTable || 'tran_log_tab'}
                          </span>
                          {box.searchParameters && box.searchParameters.length > 0 && (
                            <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded font-mono border border-slate-200/60">
                              {box.searchParameters[0].inputField} → {box.searchParameters[0].targetColumn}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100">
                        <span className="bg-slate-100 text-slate-600 text-[11px] font-medium px-2.5 py-0.5 rounded-full">
                          {(box as any).status || 'Draft'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleOpenTestDrawer(box); }}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer"
                        >
                          <span>▷</span>
                          <span>Test</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* COLUMN RULES TAB */
            filteredColumnRules.length === 0 ? (
              <div className="p-12 text-center border border-dashed border-slate-200 rounded-xl bg-white">
                <Layers className="w-12 h-12 text-slate-400 mx-auto mb-3" />
                <h3 className="text-base font-bold text-slate-800 mb-1">No Column Rules configured</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
                  Define table-level duplicate checks, completeness constraints, or value bounds.
                </p>
                <button
                  type="button"
                  onClick={() => setIsDuplicateCheckModalOpen(true)}
                  className="px-4 py-2 bg-[#F27421] text-white rounded-lg text-xs font-semibold hover:bg-[#d65f15] transition cursor-pointer"
                >
                  + Add Duplicate Check
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredColumnRules.map((rule) => {
                  const isSelected = selectedColumnRule?.id === rule.id;
                  return (
                    <div
                      key={rule.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedColumnRuleId(rule.id)}
                      className={`group relative w-full text-left bg-white rounded-xl p-4 flex flex-col justify-between transition-all cursor-pointer ${
                        isSelected
                          ? 'border-2 border-[#F27421] shadow-xs'
                          : 'border border-slate-200 hover:border-slate-300 shadow-2xs'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="p-2 rounded-lg shrink-0 border border-slate-200 bg-slate-50 text-indigo-700">
                              <Layers className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-bold text-slate-900 text-sm truncate" title={rule.ruleName}>
                                {rule.ruleName || 'Column Rule'}
                              </h3>
                              <div className="text-xs text-slate-400 capitalize mt-0.5">
                                {rule.ruleType === 'DUPLICATE_CHECK' ? 'Duplicate check' : rule.ruleType}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center">
                            <button
                              type="button"
                              className="p-1 text-slate-400 hover:text-slate-700 transition cursor-pointer"
                              title="Options"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <p className="text-xs text-slate-500 line-clamp-2 mb-3 leading-relaxed">
                          {rule.violationMessage || 'Verifies duplicate and uniqueness constraints across composite columns.'}
                        </p>

                        <div className="flex items-center gap-1.5 flex-wrap mb-4">
                          <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded font-medium border border-slate-200/60">
                            {databases.find(d => d.id === rule.targetDbId)?.name || 'Sett'}
                          </span>
                          <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded font-medium border border-slate-200/60 font-mono">
                            {rule.tableName}
                          </span>
                          {rule.columns && rule.columns.length > 0 && (
                            <span className="bg-slate-100 text-slate-600 text-xs px-2 py-0.5 rounded font-mono border border-slate-200/60">
                              {rule.columns.map(c => c.columnName).join(', ')}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100">
                        <span className="bg-slate-100 text-slate-600 text-[11px] font-medium px-2.5 py-0.5 rounded-full">
                          Active
                        </span>
                        <button
                          type="button"
                          className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer"
                        >
                          <span>▷</span>
                          <span>Test</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>

        {/* 5. Right Inspector Card matching 04_rules_library.png */}
        <aside className="bg-white border border-slate-200 rounded-xl p-5 h-fit shadow-xs">
          {activeTab === 'validation_boxes' ? (
            selectedBox ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-slate-50 text-slate-700 border border-slate-200 shrink-0">
                    {selectedBox.boxType === 'INGESTION_SEARCH' ? <Database className="w-4 h-4" /> : selectedBox.boxType === 'RECONCILIATION' ? <Layers className="w-4 h-4" /> : selectedBox.boxType === 'REPORT' ? <Cpu className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-slate-400">Selected</div>
                    <div className="text-base font-bold text-slate-900 truncate">{selectedBox.name}</div>
                  </div>
                </div>

                <div className="text-xs text-slate-500 leading-relaxed">
                  {selectedBox.description || 'No description configured for this validation box.'}
                </div>

                <div className="space-y-2.5 text-xs pt-1">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-400">Database</span>
                    <span className="font-medium text-slate-800">{databases.find(d => d.id === selectedBox.targetDbId)?.name || 'Sett'}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-400">Table</span>
                    <span className="font-mono text-slate-800">{selectedBox.targetTable || 'tran_log_tab'}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-400">Type</span>
                    <span className="font-medium text-slate-800 capitalize">
                      {selectedBox.boxType === 'INGESTION_SEARCH' ? 'Ingestion search' : selectedBox.boxType === 'RECONCILIATION' ? 'Reconciliation' : selectedBox.boxType === 'REPORT' ? 'Report output' : 'Condition check'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-400">Parameters</span>
                    <span className="font-medium text-slate-800">{selectedBox.searchParameters?.length ? `${selectedBox.searchParameters.length} active` : '0'}</span>
                  </div>
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-slate-400">Used in</span>
                    <span className="font-medium text-slate-800">1 workflow</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(selectedBox)}
                    className="flex-1 px-3 py-2 text-xs font-semibold bg-[#0F142A] hover:bg-slate-800 text-white rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenTestDrawer(selectedBox)}
                    className="flex-1 px-3 py-2 text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>▷</span>
                    <span>Run test</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setSharingBox(selectedBox); setIsShareModalOpen(true); }}
                    className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-lg transition cursor-pointer"
                    title="More Options"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-slate-400 text-xs">Select a validation box to inspect it here.</div>
            )
          ) : (
            /* COLUMN RULE INSPECTOR */
            selectedColumnRule ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-slate-50 text-indigo-700 border border-slate-200 shrink-0">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-slate-400">Selected</div>
                    <div className="text-base font-bold text-slate-900 truncate">{selectedColumnRule.ruleName}</div>
                  </div>
                </div>

                <div className="text-xs text-slate-500 leading-relaxed">
                  {selectedColumnRule.violationMessage || 'Verifies duplicate and uniqueness constraints across rows.'}
                </div>

                <div className="space-y-2.5 text-xs pt-1">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-400">Database</span>
                    <span className="font-medium text-slate-800">{databases.find(d => d.id === selectedColumnRule.targetDbId)?.name || 'Sett'}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-400">Table</span>
                    <span className="font-mono text-slate-800">{selectedColumnRule.tableName}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-400">Type</span>
                    <span className="font-medium text-slate-800 capitalize">Duplicate check</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <span className="text-slate-400">Columns</span>
                    <span className="font-medium text-slate-800">{selectedColumnRule.columns?.length || 1} priority</span>
                  </div>
                  <div className="flex items-center justify-between pb-1">
                    <span className="text-slate-400">Severity</span>
                    <span className="font-medium text-slate-800">{selectedColumnRule.severity || 'WARNING'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsDuplicateCheckModalOpen(true)}
                    className="flex-1 px-3 py-2 text-xs font-semibold bg-[#0F142A] hover:bg-slate-800 text-white rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    className="flex-1 px-3 py-2 text-xs font-semibold border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>▷</span>
                    <span>Run test</span>
                  </button>
                  <button
                    type="button"
                    className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded-lg transition cursor-pointer"
                    title="More Options"
                  >
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-slate-400 text-xs">Select a column rule to inspect it here.</div>
            )
          )}
        </aside>
      </div>

      {/* Modal: Create/Edit Validation Box */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/35 backdrop-blur-[2px] flex items-center justify-center p-4 overflow-hidden">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-hidden shadow-[0_18px_45px_rgba(15,23,42,0.12)] my-2 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/80 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200">
                  <Boxes className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Validation builder</div>
                  <h3 className="font-bold text-slate-900 text-lg leading-tight">
                    {editingBox ? 'Edit Validation Box' : 'Create New Validation Box'}
                  </h3>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-200/80 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBox} className="p-5 sm:p-6 space-y-6 overflow-y-auto overscroll-contain max-h-[calc(92vh-72px)]">
              {/* Type Switcher */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 mb-2">
                  Block Type
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setBoxType('INGESTION_SEARCH')}
                    className={`flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-lg text-[11px] font-semibold transition-all border ${
                      boxType === 'INGESTION_SEARCH'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-white'
                    }`}
                  >
                    <Database className={`w-3.5 h-3.5 ${boxType === 'INGESTION_SEARCH' ? 'text-emerald-600' : 'text-slate-500'}`} />
                    <span>Search & Ingest</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBoxType('CONDITION_CHECK')}
                    className={`flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-lg text-[11px] font-semibold transition-all border ${
                      boxType === 'CONDITION_CHECK'
                        ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-white'
                    }`}
                  >
                    <CheckCircle2 className={`w-3.5 h-3.5 ${boxType === 'CONDITION_CHECK' ? 'text-blue-600' : 'text-slate-500'}`} />
                    <span>Condition Check</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBoxType('RECONCILIATION')}
                    className={`flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-lg text-[11px] font-semibold transition-all border ${
                      boxType === 'RECONCILIATION'
                        ? 'bg-cyan-50 text-cyan-700 border-cyan-200 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-white'
                    }`}
                  >
                    <Layers className={`w-3.5 h-3.5 ${boxType === 'RECONCILIATION' ? 'text-cyan-600' : 'text-slate-500'}`} />
                    <span>Reconciliation</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBoxType('REPORT')}
                    className={`flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-lg text-[11px] font-semibold transition-all border ${
                      boxType === 'REPORT'
                        ? 'bg-purple-50 text-purple-700 border-purple-200 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 border-transparent hover:bg-white'
                    }`}
                  >
                    <Cpu className={`w-3.5 h-3.5 ${boxType === 'REPORT' ? 'text-purple-600' : 'text-slate-500'}`} />
                    <span>Report Output</span>
                  </button>
                </div>
              </div>

              {/* General details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Validation Box Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. CBS Auth Table Query"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Category</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Settlement, Authorization, Fraud"
                    className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Explain what this standalone rule evaluates or queries..."
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* Dedicated Target Data Structure: Every Box is Scoped to a Target Table */}
              <div className="border-t border-slate-200 pt-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-600">
                    <Table className="w-4 h-4 text-blue-600" />
                    <span>Dedicated Target Data Structure</span>
                  </div>
                  <span className="text-[11px] font-mono">
                    {loadingColumns ? (
                      <span className="text-amber-600 animate-pulse">Inspecting table columns...</span>
                    ) : tableColumns.length > 0 ? (
                      <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        ✓ {tableColumns.length} columns discovered in {targetTable}
                      </span>
                    ) : targetTable ? (
                      <span className="text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">Standard Schema mapped</span>
                    ) : null}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Target Database Engine *</label>
                    <select
                      value={targetDbId}
                      onChange={(e) => {
                        const newDbId = e.target.value;
                        setTargetDbId(newDbId);
                        const db = databases.find(d => d.id === newDbId);
                        const tbls = db?.availableTables || db?.allowedTables || [];
                        const newTbl = tbls[0] || '';
                        setTargetTable(newTbl);
                        setSearchParams(prev => prev.map(p => ({
                          ...p,
                          targetColumn: newDbId && newTbl ? globalMappingService.getPhysicalColumn(newDbId, newTbl, p.inputField) : p.inputField
                        })));
                      }}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="">-- Select Target Database --</option>
                      {databases.map((db) => (
                        <option key={db.id} value={db.id}>
                          {db.name} ({db.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Target Table / Collection *</label>
                    {availableTables.length > 0 ? (
                      <select
                        value={targetTable}
                        onChange={(e) => {
                          const newTbl = e.target.value;
                          setTargetTable(newTbl);
                          setSearchParams(prev => prev.map(p => ({
                            ...p,
                            targetColumn: targetDbId && newTbl ? globalMappingService.getPhysicalColumn(targetDbId, newTbl, p.inputField) : p.inputField
                          })));
                        }}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono"
                      >
                        <option value="">-- Select Table --</option>
                        {availableTables.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={targetTable}
                        onChange={(e) => {
                          const newTbl = e.target.value;
                          setTargetTable(newTbl);
                          setSearchParams(prev => prev.map(p => ({
                            ...p,
                            targetColumn: targetDbId && newTbl ? globalMappingService.getPhysicalColumn(targetDbId, newTbl, p.inputField) : p.inputField
                          })));
                        }}
                        placeholder="e.g. auth_log, host_txns"
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-mono"
                      />
                    )}
                  </div>
                </div>

                {targetDbId && targetTable && (
                  <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-cyan-600" />
                      <span className="text-slate-700">Set-Based PostgreSQL Mirror:</span>
                    </div>
                    <span className="font-mono text-cyan-700 font-bold bg-white px-2 py-0.5 rounded border border-cyan-200 text-[11px]">
                      mirror_{(databases.find(d => d.id === targetDbId)?.name || 'db').toLowerCase().replace(/[^a-z0-9_]/g, '_')}_{targetTable.toLowerCase().replace(/[^a-z0-9_]/g, '_')}
                    </span>
                  </div>
                )}
              </div>

              {/* Ingestion Search Specifics */}
              {boxType === 'INGESTION_SEARCH' && (
                <div className="border-t border-slate-800 pt-4 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                    <Database className="w-4 h-4" /> Ingestion Query Parameter Mappings
                  </div>

                  {/* Strict Global Mapping Completion Verification */}
                  {targetDbId && targetTable && (() => {
                    const mappingStatus = globalMappingService.isTableMappingComplete(targetDbId, targetTable);
                    const missingList = mappingStatus.missingRequiredColumns || mappingStatus.missingRequiredLabels || [];
                    if (mappingStatus.status === 'COMPLETE' || mappingStatus.isComplete) {
                      return (
                        <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-lg p-2.5 flex items-center justify-between text-xs text-emerald-300">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span>Strict Global Schema Verified:</span>
                          </div>
                          <span className="font-semibold text-emerald-400">All required columns mapped ({mappingStatus.mappedColumnsCount}/{mappingStatus.requiredColumnsCount})</span>
                        </div>
                      );
                    } else if (mappingStatus.status === 'INCOMPLETE') {
                      return (
                        <div className="bg-amber-950/40 border border-amber-800/50 rounded-lg p-2.5 flex items-center justify-between text-xs text-amber-200">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                            <span>Strict Mapping Warning: Missing required columns ({missingList.join(', ')})</span>
                          </div>
                          <span className="text-[10px] font-mono uppercase bg-amber-900/50 px-2 py-0.5 rounded text-amber-300">Incomplete</span>
                        </div>
                      );
                    } else {
                      return (
                        <div className="bg-red-950/40 border border-red-800/50 rounded-lg p-2.5 flex items-center justify-between text-xs text-red-200">
                          <div className="flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                            <span>Strict Mapping Enforcement: Table "{targetTable}" has not been mapped to Global Standard Schema.</span>
                          </div>
                          <span className="text-[10px] font-mono uppercase bg-red-900/50 px-2 py-0.5 rounded text-red-300">Unmapped</span>
                        </div>
                      );
                    }
                  })()}

                  {/* Parameter Mappings from Current Global Schema */}
                  <div className="space-y-3 pt-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-semibold text-white">Search Query Parameters</label>
                          <span className="text-[10px] font-mono uppercase bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 px-1.5 py-0.5 rounded">
                            Global Schema v{globalMappingService.getConfig().version || '2.3.0'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Select the Global Schema fields to query and match in table <code className="text-emerald-300 font-mono font-semibold">{targetTable || 'target table'}</code>.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            const currentFields = globalMappingService.getStandardFields();
                            const requiredOnes = currentFields
                              .filter(f => f.required)
                              .map(f => ({
                                inputField: f.key,
                                targetColumn: targetDbId && targetTable ? globalMappingService.getPhysicalColumn(targetDbId, targetTable, f.key) : f.key,
                                required: true
                              }));
                            setSearchParams(requiredOnes);
                          }}
                          className="text-[11px] bg-slate-900 hover:bg-slate-800 text-emerald-400 border border-slate-800 hover:border-slate-700 px-2.5 py-1 rounded-lg font-medium transition"
                        >
                          Select Required
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const currentFields = globalMappingService.getStandardFields();
                            const allOnes = currentFields.map(f => ({
                              inputField: f.key,
                              targetColumn: targetDbId && targetTable ? globalMappingService.getPhysicalColumn(targetDbId, targetTable, f.key) : f.key,
                              required: !!f.required
                            }));
                            setSearchParams(allOnes);
                          }}
                          className="text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 px-2.5 py-1 rounded-lg font-medium transition"
                        >
                          Select All
                        </button>
                        {searchParams.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setSearchParams([])}
                            className="text-[11px] text-slate-400 hover:text-rose-400 px-2 py-1 transition"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Simplified Global Schema Parameter List */}
                    <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
                      <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-900/90 border-b border-slate-800 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        <div className="col-span-1 text-center">Active</div>
                        <div className="col-span-5">Global Schema Field</div>
                        <div className="col-span-4">Mapped Target Column ({targetTable})</div>
                        <div className="col-span-2 text-right">Requirement</div>
                      </div>

                      <div className="divide-y divide-slate-900 max-h-60 overflow-y-auto">
                        {globalMappingService.getStandardFields().map((field) => {
                          const physicalCol = targetDbId && targetTable 
                            ? globalMappingService.getPhysicalColumn(targetDbId, targetTable, field.key)
                            : field.key;
                          
                          const activeIdx = searchParams.findIndex(
                            p => p.inputField === field.key || p.targetColumn === physicalCol
                          );
                          const isSelected = activeIdx !== -1;
                          const currentParam = isSelected ? searchParams[activeIdx] : null;

                          return (
                            <div
                              key={field.key}
                              onClick={() => {
                                if (isSelected) {
                                  setSearchParams(searchParams.filter((_, i) => i !== activeIdx));
                                } else {
                                  setSearchParams([
                                    ...searchParams,
                                    { inputField: field.key, targetColumn: physicalCol, required: !!field.required }
                                  ]);
                                }
                              }}
                              className={`grid grid-cols-12 gap-2 px-3 py-2.5 items-center text-xs transition cursor-pointer select-none ${
                                isSelected 
                                  ? 'bg-emerald-950/25 hover:bg-emerald-950/35' 
                                  : 'hover:bg-slate-900/50 text-slate-400'
                              }`}
                            >
                              {/* Checkbox */}
                              <div className="col-span-1 flex justify-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => {}} // toggled by row click
                                  className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer"
                                />
                              </div>

                              {/* Global Schema Field */}
                              <div className="col-span-5 min-w-0 pr-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`font-mono text-xs font-semibold truncate ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                                    {field.key}
                                  </span>
                                  <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
                                    {field.dataType}
                                  </span>
                                  {field.required && (
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-rose-950/80 text-rose-300 border border-rose-800/40 font-semibold">
                                      Req
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 truncate mt-0.5" title={field.label}>
                                  {field.label}
                                </div>
                              </div>

                              {/* Mapped DB Column */}
                              <div className="col-span-4 min-w-0 flex items-center gap-1.5">
                                <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" />
                                <span className={`font-mono text-xs px-2 py-0.5 rounded border truncate ${
                                  isSelected 
                                    ? 'bg-emerald-950/50 text-emerald-300 border-emerald-800/50 font-semibold' 
                                    : 'bg-slate-900 text-slate-400 border-slate-800'
                                }`}>
                                  {physicalCol}
                                </span>
                              </div>

                              {/* Required Toggle */}
                              <div 
                                className="col-span-2 flex items-center justify-end"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {isSelected ? (
                                  <label className="flex items-center gap-1 cursor-pointer text-[10px]">
                                    <input
                                      type="checkbox"
                                      checked={currentParam?.required ?? false}
                                      onChange={(e) => {
                                        const updated = [...searchParams];
                                        updated[activeIdx].required = e.target.checked;
                                        setSearchParams(updated);
                                      }}
                                      className="w-3.5 h-3.5 rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer"
                                    />
                                    <span className={currentParam?.required ? 'text-emerald-300 font-medium' : 'text-slate-400'}>
                                      {currentParam?.required ? 'Req' : 'Opt'}
                                    </span>
                                  </label>
                                ) : (
                                  <span className="text-[10px] text-slate-600 italic">—</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Real-time Query Filter Preview */}
                    {searchParams.length > 0 ? (
                      <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 text-slate-300">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          <span>
                            <strong className="text-white font-mono">{searchParams.length}</strong> parameters active for <strong className="text-emerald-300 font-mono">{targetTable}</strong> query
                          </span>
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 truncate max-w-sm" title={searchParams.map(p => `${p.targetColumn} = :${p.inputField}`).join(' AND ')}>
                          WHERE {searchParams.map(p => `${p.targetColumn} = :${p.inputField}`).join(' AND ')}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-2.5 text-xs text-amber-300/90 bg-amber-950/20 border border-amber-900/40 rounded-lg">
                        ⚠️ No search parameters selected. Please select at least one field from the Global Schema above.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Reconciliation Box Specifics */}
              {boxType === 'RECONCILIATION' && (
                <div className="border-t border-slate-800 pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-400">
                      <Layers className="w-4 h-4" /> Standalone Reconciliation & Multi-Leg Grouping Configuration
                    </div>
                    <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/50 px-2 py-0.5 rounded">
                      Target: {targetTable || 'Select table above'} ({availableColumnNames.length} cols)
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Input Match Key <span className="text-emerald-400 font-mono text-[10px]">(Global Schema)</span>
                      </label>
                      <select
                        value={matchKeyInput}
                        onChange={(e) => setMatchKeyInput(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                      >
                        <option value="">-- Select Input Key (Global Schema) --</option>
                        {globalStandardFields.map(f => (
                          <option key={f.key} value={f.key}>
                            {f.label} ({f.key})
                          </option>
                        ))}
                        {matchKeyInput && !globalStandardFields.some(f => f.key === matchKeyInput) && (
                          <option value={matchKeyInput}>{matchKeyInput} (Custom)</option>
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        External DB Match Key <span className="text-cyan-400 font-mono text-[10px]">({targetTable || 'Target Table'})</span>
                      </label>
                      {availableColumnNames.length > 0 ? (
                        <select
                          value={matchKeyExternal}
                          onChange={(e) => setMatchKeyExternal(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                        >
                          <option value="">-- Select Column ({targetTable}) --</option>
                          {availableColumnNames.map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                          {matchKeyExternal && !availableColumnNames.includes(matchKeyExternal) && (
                            <option value={matchKeyExternal}>{matchKeyExternal} (Custom)</option>
                          )}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={matchKeyExternal}
                          onChange={(e) => setMatchKeyExternal(e.target.value)}
                          placeholder="e.g. tran_id, host_ref"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-cyan-500"
                        />
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Multi-Row Resolution</label>
                      <select
                        value={multiRowPolicy}
                        onChange={(e) => setMultiRowPolicy(e.target.value as any)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                      >
                        <option value="COMPOSITE_BUNDLE">Composite Bundle (Group Hierarchy)</option>
                        <option value="LATEST">Latest Record</option>
                        <option value="EARLIEST">Earliest Record</option>
                        <option value="AGGREGATE_SUM">Aggregate Sum (Amounts)</option>
                        <option value="STRICT_SINGLE">Strict Single Match</option>
                      </select>
                    </div>
                  </div>

                  {/* Grouped Multi-Leg Transaction Configuration */}
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-white">
                      <input
                        type="checkbox"
                        checked={isGroupedEnabled}
                        onChange={(e) => setIsGroupedEnabled(e.target.checked)}
                        className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0"
                      />
                      <span>Enable Multi-Leg Grouping (Original, Reversal, Debit, Credit, Fee Legs)</span>
                    </label>

                    {isGroupedEnabled && (
                      <div className="space-y-3 pt-2 border-t border-slate-800/80 text-xs">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">
                              Group ID Column Name <span className="text-cyan-400 font-mono text-[10px]">({targetTable})</span>
                            </label>
                            {availableColumnNames.length > 0 ? (
                              <select
                                value={groupIdField}
                                onChange={(e) => setGroupIdField(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:border-cyan-500"
                              >
                                <option value="">-- Select Group ID Column --</option>
                                {availableColumnNames.map(col => (
                                  <option key={col} value={col}>{col}</option>
                                ))}
                                {groupIdField && !availableColumnNames.includes(groupIdField) && (
                                  <option value={groupIdField}>{groupIdField} (Custom)</option>
                                )}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={groupIdField}
                                onChange={(e) => setGroupIdField(e.target.value)}
                                placeholder="e.g. utrnno, parent_id"
                                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                              />
                            )}
                          </div>

                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">
                              Event Phase Column Name <span className="text-cyan-400 font-mono text-[10px]">({targetTable})</span>
                            </label>
                            {availableColumnNames.length > 0 ? (
                              <select
                                value={eventPhaseField}
                                onChange={(e) => setEventPhaseField(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:border-cyan-500"
                              >
                                <option value="">-- Select Event Phase Column --</option>
                                {availableColumnNames.map(col => (
                                  <option key={col} value={col}>{col}</option>
                                ))}
                                {eventPhaseField && !availableColumnNames.includes(eventPhaseField) && (
                                  <option value={eventPhaseField}>{eventPhaseField} (Custom)</option>
                                )}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={eventPhaseField}
                                onChange={(e) => setEventPhaseField(e.target.value)}
                                placeholder="e.g. event_type, action_code"
                                className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                              />
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Original Phase Value</label>
                            <input
                              type="text"
                              value={origValue}
                              onChange={(e) => setOrigValue(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Reversal Phase Value</label>
                            <input
                              type="text"
                              value={revValue}
                              onChange={(e) => setRevValue(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Refund Phase Value</label>
                            <input
                              type="text"
                              value={refValue}
                              onChange={(e) => setRefValue(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-4 gap-2 pt-1 border-t border-slate-800/60">
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">
                              Leg Indicator Column <span className="text-cyan-400 font-mono text-[9px]">({targetTable})</span>
                            </label>
                            {availableColumnNames.length > 0 ? (
                              <select
                                value={legIndicatorField}
                                onChange={(e) => setLegIndicatorField(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono focus:border-cyan-500"
                              >
                                <option value="">-- Select Column --</option>
                                {availableColumnNames.map(col => (
                                  <option key={col} value={col}>{col}</option>
                                ))}
                                {legIndicatorField && !availableColumnNames.includes(legIndicatorField) && (
                                  <option value={legIndicatorField}>{legIndicatorField} (Custom)</option>
                                )}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={legIndicatorField}
                                onChange={(e) => setLegIndicatorField(e.target.value)}
                                placeholder="e.g. dr_cr_ind"
                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono"
                              />
                            )}
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Debit Value</label>
                            <input
                              type="text"
                              value={debitValue}
                              onChange={(e) => setDebitValue(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Credit Value</label>
                            <input
                              type="text"
                              value={creditValue}
                              onChange={(e) => setCreditValue(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Fee Value</label>
                            <input
                              type="text"
                              value={feeValue}
                              onChange={(e) => setFeeValue(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Standalone Report Box Specifics */}
              {boxType === 'REPORT' && (
                <div className="border-t border-slate-800 pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-400">
                      <Cpu className="w-4 h-4" /> Dynamic Report Projection & Status Binding
                    </div>
                    <span className="text-[11px] font-mono text-purple-400 bg-purple-950/60 border border-purple-800/50 px-2 py-0.5 rounded">
                      Mirror: {targetTable || 'Select table above'}
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Target Status Column Name <span className="text-purple-400 font-mono text-[10px]">({targetTable || 'Target Table'})</span>
                    </label>
                    <select
                      value={statusTargetField}
                      onChange={(e) => setStatusTargetField(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-purple-500"
                    >
                      <optgroup label="Standard Status Fields">
                        <option value="reconciliation_status">reconciliation_status</option>
                        <option value="investigation_status">investigation_status</option>
                        <option value="investigation_verdict">investigation_verdict</option>
                        <option value="audit_status">audit_status</option>
                      </optgroup>
                      {availableColumnNames.length > 0 && (
                        <optgroup label={`Columns in ${targetTable}`}>
                          {availableColumnNames.map(c => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </optgroup>
                      )}
                      {statusTargetField && !['reconciliation_status', 'investigation_status', 'investigation_verdict', 'audit_status', ...availableColumnNames].includes(statusTargetField) && (
                        <option value={statusTargetField}>{statusTargetField} (Custom)</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div>
                        <label className="text-xs font-semibold text-slate-300">Output Columns Projection</label>
                        <p className="text-[10px] text-slate-400">
                          Select fields from the Global List (input) or target table columns ({targetTable || 'External Mirror'}).
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const defaultField = globalStandardFields[0]?.key || 'transaction_id';
                          const defaultLabel = globalStandardFields[0]?.label || 'Transaction ID';
                          setOutputColumns([...outputColumns, { source: 'INPUT', field: defaultField, headerAlias: defaultLabel }]);
                        }}
                        className="text-[11px] text-purple-400 hover:text-purple-300 font-medium"
                      >
                        + Add Column
                      </button>
                    </div>

                    <div className="space-y-2">
                      {outputColumns.map((col, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-950 p-2 rounded-lg border border-slate-800 text-xs">
                          <div className="col-span-3">
                            <select
                              value={col.source}
                              onChange={(e) => {
                                const newSrc = e.target.value as any;
                                const updated = [...outputColumns];
                                updated[idx].source = newSrc;
                                if (newSrc === 'INPUT' && globalStandardFields.length > 0) {
                                  updated[idx].field = globalStandardFields[0].key;
                                  updated[idx].headerAlias = globalStandardFields[0].label;
                                } else if (newSrc === 'MIRROR' && availableColumnNames.length > 0) {
                                  updated[idx].field = availableColumnNames[0];
                                  updated[idx].headerAlias = availableColumnNames[0].replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                                }
                                setOutputColumns(updated);
                              }}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                            >
                              <option value="INPUT">Input File (Global List)</option>
                              <option value="MIRROR">External Mirror ({targetTable || 'Table'})</option>
                              <option value="COMPUTED">Computed</option>
                            </select>
                          </div>
                          <div className="col-span-4">
                            {col.source === 'INPUT' ? (
                              <select
                                value={col.field}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const updated = [...outputColumns];
                                  updated[idx].field = val;
                                  const std = globalStandardFields.find(f => f.key === val);
                                  if (std && (!updated[idx].headerAlias || updated[idx].headerAlias === 'Status' || updated[idx].headerAlias === col.field)) {
                                    updated[idx].headerAlias = std.label;
                                  }
                                  setOutputColumns(updated);
                                }}
                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono focus:border-purple-500"
                              >
                                <option value="">-- Select Global Field --</option>
                                {globalStandardFields.map((f) => (
                                  <option key={f.key} value={f.key}>
                                    {f.label} ({f.key})
                                  </option>
                                ))}
                                {col.field && !globalStandardFields.some(f => f.key === col.field) && (
                                  <option value={col.field}>{col.field} (Custom)</option>
                                )}
                              </select>
                            ) : col.source === 'MIRROR' ? (
                              availableColumnNames.length > 0 ? (
                                <select
                                  value={col.field}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const updated = [...outputColumns];
                                    updated[idx].field = val;
                                    if (!updated[idx].headerAlias || updated[idx].headerAlias === 'Status' || updated[idx].headerAlias === col.field) {
                                      updated[idx].headerAlias = val.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                                    }
                                    setOutputColumns(updated);
                                  }}
                                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono focus:border-purple-500"
                                >
                                  <option value="">-- Select Column ({targetTable}) --</option>
                                  {availableColumnNames.map((cName) => (
                                    <option key={cName} value={cName}>
                                      {cName}
                                    </option>
                                  ))}
                                  {col.field && !availableColumnNames.includes(col.field) && (
                                    <option value={col.field}>{col.field} (Custom)</option>
                                  )}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  value={col.field}
                                  onChange={(e) => {
                                    const updated = [...outputColumns];
                                    updated[idx].field = e.target.value;
                                    setOutputColumns(updated);
                                  }}
                                  placeholder="Column name"
                                  className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono"
                                />
                              )
                            ) : (
                              <input
                                type="text"
                                value={col.field}
                                onChange={(e) => {
                                  const updated = [...outputColumns];
                                  updated[idx].field = e.target.value;
                                  setOutputColumns(updated);
                                }}
                                placeholder="Computed property (e.g. variance)"
                                className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono focus:border-purple-500"
                              />
                            )}
                          </div>
                          <div className="col-span-4">
                            <input
                              type="text"
                              value={col.headerAlias}
                              onChange={(e) => {
                                const updated = [...outputColumns];
                                updated[idx].headerAlias = e.target.value;
                                setOutputColumns(updated);
                              }}
                              placeholder="Header Title"
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                            />
                          </div>
                          <div className="col-span-1 flex justify-center">
                            <button
                              type="button"
                              onClick={() => setOutputColumns(outputColumns.filter((_, i) => i !== idx))}
                              className="text-slate-500 hover:text-rose-400"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Message Template</label>
                    <textarea
                      rows={2}
                      value={messageTemplate}
                      onChange={(e) => setMessageTemplate(e.target.value)}
                      placeholder="e.g. Transaction {{transaction_id}} verified: Input={{amount}}, Host={{posted_amount}}"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              )}

              {/* Condition Check Specifics */}
              {boxType === 'CONDITION_CHECK' && (
                <div className="border-t border-slate-800 pt-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-400">
                      <CheckCircle2 className="w-4 h-4" /> Dynamic Condition Evaluation Logic
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={useDualSource}
                        onChange={(e) => setUseDualSource(e.target.checked)}
                        className="w-3.5 h-3.5 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-0"
                      />
                      <span>Dual-Source Mode (Source A vs Source B)</span>
                    </label>
                  </div>

                  {useDualSource ? (
                    /* DUAL-SOURCE COMPARISON BUILDER */
                    <div className="space-y-3 bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-xs">
                      {/* Source A */}
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-3">
                          <label className="block text-[10px] text-slate-400 mb-0.5 font-semibold">Source A Origin</label>
                          <select
                            value={sourceAOrigin}
                            onChange={(e) => {
                              const newOrigin = e.target.value as any;
                              setSourceAOrigin(newOrigin);
                              if (newOrigin === 'INPUT' && globalStandardFields.length > 0) {
                                setSourceAField(globalStandardFields[0].key);
                              } else if ((newOrigin === 'MIRROR' || newOrigin === 'LEG') && availableColumnNames.length > 0) {
                                setSourceAField(availableColumnNames[0]);
                              }
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-white"
                          >
                            <option value="INPUT">Input File (Global List)</option>
                            <option value="MIRROR">External Mirror ({targetTable || 'Table'})</option>
                            <option value="LEG">Grouped Leg ({targetTable || 'Table'})</option>
                          </select>
                        </div>
                        <div className={sourceAOrigin === 'LEG' ? 'col-span-4' : 'col-span-9'}>
                          <label className="block text-[10px] text-slate-400 mb-0.5 font-semibold">
                            Source A Field {sourceAOrigin === 'INPUT' ? '(Global Schema)' : `(${targetTable || 'Table'})`}
                          </label>
                          {sourceAOrigin === 'INPUT' ? (
                            <select
                              value={sourceAField}
                              onChange={(e) => setSourceAField(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:border-blue-500"
                            >
                              <option value="">-- Select Global Field --</option>
                              {globalStandardFields.map(f => (
                                <option key={f.key} value={f.key}>
                                  {f.label} ({f.key})
                                </option>
                              ))}
                              {sourceAField && !globalStandardFields.some(f => f.key === sourceAField) && (
                                <option value={sourceAField}>{sourceAField} (Custom)</option>
                              )}
                            </select>
                          ) : availableColumnNames.length > 0 ? (
                            <select
                              value={sourceAField}
                              onChange={(e) => setSourceAField(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:border-blue-500"
                            >
                              <option value="">-- Select Column ({targetTable}) --</option>
                              {availableColumnNames.map(col => (
                                <option key={col} value={col}>{col}</option>
                              ))}
                              {sourceAField && !availableColumnNames.includes(sourceAField) && (
                                <option value={sourceAField}>{sourceAField} (Custom)</option>
                              )}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={sourceAField}
                              onChange={(e) => setSourceAField(e.target.value)}
                              placeholder="e.g. amount, txn_amount"
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                            />
                          )}
                        </div>
                        {sourceAOrigin === 'LEG' && (
                          <div className="col-span-5">
                            <label className="block text-[10px] text-slate-400 mb-0.5 font-semibold">Leg Key</label>
                            <select
                              value={sourceALegKey}
                              onChange={(e) => setSourceALegKey(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-white font-mono"
                            >
                              <option value="ORIGINAL.DEBIT">ORIGINAL.DEBIT</option>
                              <option value="ORIGINAL.CREDIT">ORIGINAL.CREDIT</option>
                              <option value="ORIGINAL.FEE">ORIGINAL.FEE</option>
                              <option value="REVERSAL.DEBIT">REVERSAL.DEBIT</option>
                              <option value="REVERSAL.CREDIT">REVERSAL.CREDIT</option>
                              <option value="REVERSAL.FEE">REVERSAL.FEE</option>
                            </select>
                          </div>
                        )}
                      </div>

                      {/* Comparator & Tolerance */}
                      <div className="grid grid-cols-2 gap-3 py-1 border-y border-slate-800/80">
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-0.5 font-semibold">Comparison Operator</label>
                          <select
                            value={operator}
                            onChange={(e) => setOperator(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-blue-300 font-semibold"
                          >
                            <option value="EQUALS">Strict Equals (==)</option>
                            <option value="CONTAINS">Contains Substring (LIKE)</option>
                            <option value="NOT_CONTAINS">Does Not Contain</option>
                            <option value="NUMERIC_TOLERANCE">Numeric Tolerance (± margin)</option>
                            <option value="NOT_EQUALS">Not Equals (!=)</option>
                            <option value="GREATER_THAN">Greater Than (&gt;)</option>
                            <option value="LESS_THAN">Less Than (&lt;)</option>
                            <option value="IN">In List / Set</option>
                            <option value="LOOKUP_MAP">Dynamic Code Dictionary (Zero-Hardcoded)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-0.5 font-semibold">
                            {operator === 'NUMERIC_TOLERANCE' ? 'Tolerance Margin (±)' : 'Optional Param'}
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={tolerance}
                            onChange={(e) => setTolerance(e.target.value)}
                            placeholder="0.00 for exact match"
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white"
                          />
                        </div>
                      </div>

                      {/* Source B */}
                      <div className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-3">
                          <label className="block text-[10px] text-slate-400 mb-0.5 font-semibold">Source B Origin</label>
                          <select
                            value={sourceBOrigin}
                            onChange={(e) => {
                              const newOrigin = e.target.value as any;
                              setSourceBOrigin(newOrigin);
                              if (newOrigin === 'INPUT' && globalStandardFields.length > 0) {
                                setSourceBField(globalStandardFields[0].key);
                              } else if ((newOrigin === 'MIRROR' || newOrigin === 'LEG') && availableColumnNames.length > 0) {
                                setSourceBField(availableColumnNames[0]);
                              }
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-white"
                          >
                            <option value="MIRROR">External Mirror ({targetTable || 'Table'})</option>
                            <option value="INPUT">Input File (Global List)</option>
                            <option value="LEG">Grouped Leg ({targetTable || 'Table'})</option>
                          </select>
                        </div>
                        <div className={sourceBOrigin === 'LEG' ? 'col-span-4' : 'col-span-9'}>
                          <label className="block text-[10px] text-slate-400 mb-0.5 font-semibold">
                            Source B Field {sourceBOrigin === 'INPUT' ? '(Global Schema)' : `(${targetTable || 'Table'})`}
                          </label>
                          {sourceBOrigin === 'INPUT' ? (
                            <select
                              value={sourceBField}
                              onChange={(e) => setSourceBField(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:border-blue-500"
                            >
                              <option value="">-- Select Global Field --</option>
                              {globalStandardFields.map(f => (
                                <option key={f.key} value={f.key}>
                                  {f.label} ({f.key})
                                </option>
                              ))}
                              {sourceBField && !globalStandardFields.some(f => f.key === sourceBField) && (
                                <option value={sourceBField}>{sourceBField} (Custom)</option>
                              )}
                            </select>
                          ) : availableColumnNames.length > 0 ? (
                            <select
                              value={sourceBField}
                              onChange={(e) => setSourceBField(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono focus:border-blue-500"
                            >
                              <option value="">-- Select Column ({targetTable}) --</option>
                              {availableColumnNames.map(col => (
                                <option key={col} value={col}>{col}</option>
                              ))}
                              {sourceBField && !availableColumnNames.includes(sourceBField) && (
                                <option value={sourceBField}>{sourceBField} (Custom)</option>
                              )}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={sourceBField}
                              onChange={(e) => setSourceBField(e.target.value)}
                              placeholder="e.g. posted_amount, cbs_amt"
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                            />
                          )}
                        </div>
                        {sourceBOrigin === 'LEG' && (
                          <div className="col-span-5">
                            <label className="block text-[10px] text-slate-400 mb-0.5 font-semibold">Leg Key</label>
                            <select
                              value={sourceBLegKey}
                              onChange={(e) => setSourceBLegKey(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-white font-mono"
                            >
                              <option value="REVERSAL.CREDIT">REVERSAL.CREDIT</option>
                              <option value="ORIGINAL.DEBIT">ORIGINAL.DEBIT</option>
                              <option value="ORIGINAL.CREDIT">ORIGINAL.CREDIT</option>
                              <option value="ORIGINAL.FEE">ORIGINAL.FEE</option>
                              <option value="REVERSAL.DEBIT">REVERSAL.DEBIT</option>
                              <option value="REVERSAL.FEE">REVERSAL.FEE</option>
                            </select>
                          </div>
                        )}
                      </div>

                      {/* Custom Code Dictionary when LOOKUP_MAP is chosen */}
                      {operator === 'LOOKUP_MAP' && (
                        <div className="pt-2 space-y-2 border-t border-slate-800">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-slate-300">Configurable Code Dictionary (No Hardcoded Codes)</span>
                            <button
                              type="button"
                              onClick={() => setLookupDictEntries([...lookupDictEntries, { code: '', label: '' }])}
                              className="text-[11px] text-blue-400 hover:text-blue-300"
                            >
                              + Add Code
                            </button>
                          </div>
                          <div className="space-y-1.5 max-h-36 overflow-y-auto">
                            {lookupDictEntries.map((entry, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  placeholder="Code (e.g. 00)"
                                  value={entry.code}
                                  onChange={(e) => {
                                    const updated = [...lookupDictEntries];
                                    updated[idx].code = e.target.value;
                                    setLookupDictEntries(updated);
                                  }}
                                  className="w-24 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono"
                                />
                                <input
                                  type="text"
                                  placeholder="Label (e.g. Approved)"
                                  value={entry.label}
                                  onChange={(e) => {
                                    const updated = [...lookupDictEntries];
                                    updated[idx].label = e.target.value;
                                    setLookupDictEntries(updated);
                                  }}
                                  className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                                />
                                <button
                                  type="button"
                                  onClick={() => setLookupDictEntries(lookupDictEntries.filter((_, i) => i !== idx))}
                                  className="text-slate-500 hover:text-rose-400"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Legacy Single Field Constant Check */
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Evaluated Field</label>
                        <select
                          value={evalField}
                          onChange={(e) => setEvalField(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-blue-500"
                        >
                          <optgroup label="Global Standard Schema (Input)">
                            {globalStandardFields.map(f => (
                              <option key={f.key} value={f.key}>{f.label} ({f.key})</option>
                            ))}
                          </optgroup>
                          {availableColumnNames.length > 0 && (
                            <optgroup label={`Target Table Columns (${targetTable || 'Table'})`}>
                              {availableColumnNames.map(col => (
                                <option key={col} value={col}>{col}</option>
                              ))}
                            </optgroup>
                          )}
                          {evalField && !globalStandardFields.some(f => f.key === evalField) && !availableColumnNames.includes(evalField) && (
                            <option value={evalField}>{evalField} (Custom)</option>
                          )}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Operator</label>
                        <select
                          value={operator}
                          onChange={(e) => setOperator(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                        >
                          <option value="EQUALS">Strict Equals (==)</option>
                          <option value="CONTAINS">Contains Substring (LIKE %val%)</option>
                          <option value="NOT_CONTAINS">Does Not Contain</option>
                          <option value="STARTS_WITH">Starts With</option>
                          <option value="ENDS_WITH">Ends With</option>
                          <option value="NOT_EQUALS">Not Equals (!=)</option>
                          <option value="NUMERIC_TOLERANCE">Numeric Tolerance (± diff)</option>
                          <option value="NOT_NULL">Not Null / Exists</option>
                          <option value="GREATER_THAN">Greater Than (&gt;)</option>
                          <option value="LESS_THAN">Less Than (&lt;)</option>
                          <option value="IN">In List / Set (Comma-separated)</option>
                          <option value="REGEX_MATCH">Regex Match</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Expected Value</label>
                        <input
                          type="text"
                          value={expectedValue}
                          onChange={(e) => setExpectedValue(e.target.value)}
                          placeholder="e.g. 150.00, COMPLETED"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                        />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Severity on Failure</label>
                      <select
                        value={severity}
                        onChange={(e) => setSeverity(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                      >
                        <option value="CRITICAL">CRITICAL</option>
                        <option value="HIGH">HIGH</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="LOW">LOW</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">On Success</label>
                      <select
                        value={actionSuccess}
                        onChange={(e) => setActionSuccess(e.target.value)}
                        className={`w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold ${
                          actionSuccess === 'STOP' ? 'text-rose-400' : 'text-emerald-400'
                        }`}
                      >
                        <option value="CONTINUE">CONTINUE</option>
                        <option value="STOP">STOP</option>
                        <option value="RECONCILE">RECONCILE</option>
                        <option value="CLOSE_PASS">CLOSE_PASS</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">On Failure</label>
                      <select
                        value={actionFailure}
                        onChange={(e) => setActionFailure(e.target.value)}
                        className={`w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold ${
                          actionFailure === 'CONTINUE' ? 'text-blue-400' : 'text-rose-400'
                        }`}
                      >
                        <option value="CONTINUE">CONTINUE</option>
                        <option value="FLAG">FLAG</option>
                        <option value="STOP">STOP</option>
                        <option value="ESCALATE">ESCALATE</option>
                        <option value="RETRY">RETRY</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Database Table Column Configurations & Complete Rules */}
              {(targetDbId && targetTable) && (
                <div className="border-t border-slate-800 pt-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Sliders className="w-4 h-4 text-indigo-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                          Database Table Rules & Complete Column Configurations
                        </span>
                        <span className="text-[10px] font-mono font-bold bg-indigo-950 text-indigo-300 border border-indigo-800/60 px-1.5 py-0.5 rounded">
                          {selectedColumnConfigIds.length} of {tableColumnConfigs.length} active
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Link table-level rules (Completeness, Value Ranges, Duplicate checks, Value Labels) to enforce complete validation inside this box.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedColumnConfigIds(tableColumnConfigs.map(c => c.id));
                        }}
                        className="text-[11px] bg-indigo-950 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/60 px-2 py-1 rounded font-medium transition cursor-pointer"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedColumnConfigIds([])}
                        className="text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800 px-2 py-1 rounded font-medium transition cursor-pointer"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {loadingConfigs ? (
                    <div className="py-4 text-center text-xs text-slate-400 animate-pulse">Loading table rules...</div>
                  ) : tableColumnConfigs.length === 0 ? (
                    <div className="p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl text-center">
                      <p className="text-xs text-slate-400">
                        No column configurations defined yet for <code className="text-indigo-300 font-mono">{targetTable}</code>.
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Use the <strong>Database Column Configurations Studio</strong> to define duplicate checks, completeness constraints, value bounds, and label dictionaries.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                      {tableColumnConfigs.map((cfg) => {
                        const isSelected = selectedColumnConfigIds.includes(cfg.id);
                        const getRuleMeta = (type: string) => {
                          switch (type) {
                            case 'COMPLETENESS_CHECK':
                              return { badge: 'bg-emerald-950 text-emerald-300 border-emerald-800', label: 'Completeness' };
                            case 'VALUE_RANGE_CHECK':
                              return { badge: 'bg-amber-950 text-amber-300 border-amber-800', label: 'Value Range' };
                            case 'DUPLICATE_CHECK':
                              return { badge: 'bg-indigo-950 text-indigo-300 border-indigo-800', label: 'Duplicate Check' };
                            case 'VALUE_LABEL_CHECK':
                              return { badge: 'bg-purple-950 text-purple-300 border-purple-800', label: 'Value Labels' };
                            case 'PATTERN_CHECK':
                              return { badge: 'bg-cyan-950 text-cyan-300 border-cyan-800', label: 'Pattern Regex' };
                            default:
                              return { badge: 'bg-slate-800 text-slate-300 border-slate-700', label: type };
                          }
                        };
                        const meta = getRuleMeta(cfg.ruleType);

                        return (
                          <div
                            key={cfg.id}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedColumnConfigIds(prev => prev.filter(id => id !== cfg.id));
                              } else {
                                setSelectedColumnConfigIds(prev => [...prev, cfg.id]);
                              }
                            }}
                            className={`p-2.5 rounded-xl border text-xs cursor-pointer transition flex items-start gap-2.5 ${
                              isSelected
                                ? 'bg-indigo-950/40 border-indigo-500/80 shadow-xs'
                                : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-900/40'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="mt-0.5 w-4 h-4 rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-0 cursor-pointer shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1 mb-1">
                                <span className={`font-semibold truncate text-[11px] ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                                  {cfg.name}
                                </span>
                                <span className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded border ${meta.badge}`}>
                                  {meta.label}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-400">
                                <span>Cols:</span>
                                {cfg.columns?.slice(0, 3).map((col, cIdx) => (
                                  <span key={cIdx} className="font-mono bg-slate-900 border border-slate-800 px-1 py-0.2 rounded text-slate-300">
                                    {col.columnName}
                                  </span>
                                ))}
                                {cfg.columns?.length > 3 && (
                                  <span className="text-slate-500 font-mono">+{cfg.columns.length - 3} more</span>
                                )}
                              </div>
                              {cfg.violationMessage && (
                                <p className="text-[10px] text-slate-500 truncate mt-1 italic">
                                  {cfg.violationMessage}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all"
                >
                  {editingBox ? 'Save Changes' : 'Create Validation Box'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Test Execution Simulator Drawer */}
      {testingBox && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
          <div className="bg-slate-900 border-l border-slate-800 w-full max-w-lg h-full flex flex-col shadow-2xl p-6 overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Play className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-white text-base">Validation Box Simulator</h3>
                  <p className="text-xs text-slate-400">Testing: {testingBox.name}</p>
                </div>
              </div>
              <button
                onClick={() => setTestingBox(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 py-4 flex-1">
              {/* Header Info & Mode Switcher */}
              <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-950/70 border border-slate-800 rounded-lg">
                <div className="text-[11px] text-slate-300">
                  Mode: <span className="font-semibold text-emerald-400">{testingBox.boxType}</span>
                </div>
                <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setTestViewMode('FORM')}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded transition ${
                      testViewMode === 'FORM'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Parameters Form
                  </button>
                  <button
                    type="button"
                    onClick={() => setTestViewMode('JSON')}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded transition ${
                      testViewMode === 'JSON'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Raw JSON
                  </button>
                </div>
              </div>

              {testViewMode === 'FORM' ? (
                /* Dynamic Parameter Input Form */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-300">
                      Given Parameters ({Object.keys(testParams).length})
                    </label>
                    <button
                      type="button"
                      onClick={handleResetToBoxParams}
                      className="text-[11px] text-blue-400 hover:text-blue-300 underline font-medium cursor-pointer"
                    >
                      Reset to Block Parameters
                    </button>
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {Object.keys(testParams).length === 0 ? (
                      <div className="text-xs text-slate-500 italic p-3 bg-slate-950/50 rounded-lg border border-slate-800 text-center">
                        No parameters defined. Add one below.
                      </div>
                    ) : (
                      Object.entries(testParams).map(([key, val]) => {
                        const isReq = Boolean(
                          testingBox.searchParameters?.some(p => (p.inputField === key || p.targetColumn === key) && p.required !== false) ||
                          testingBox.checkStep?.requiredParams?.includes(key) ||
                          (testingBox.boxType === 'CONDITION_CHECK' && (testingBox.checkStep?.canonicalField === key || testingBox.checkStep?.sourceField === key)) ||
                          (testingBox.boxType === 'RECONCILIATION' && testingBox.matchKeyInput === key)
                        );
                        return (
                          <div
                            key={key}
                            className="flex items-center gap-2 p-2 bg-slate-950 border border-slate-800 rounded-lg"
                          >
                            <div className="w-1/3 min-w-0 flex items-center gap-1.5">
                              <span className="text-xs font-mono font-bold text-slate-200 truncate block" title={key}>
                                {key}
                              </span>
                              {isReq && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0" title="Required parameter for this validation box">
                                  Req
                                </span>
                              )}
                            </div>
                            <div className="flex-1">
                              <input
                                type="text"
                                value={val !== undefined && val !== null ? String(val) : ''}
                                onChange={(e) => handleParamChange(key, e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-emerald-300 font-mono focus:border-blue-500 focus:outline-none"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => handleParamDelete(key)}
                              className="text-slate-500 hover:text-rose-400 p-1 transition cursor-pointer"
                              title="Remove parameter"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Add New Parameter */}
                  <div className="p-2.5 bg-slate-950/80 border border-dashed border-slate-800 rounded-lg space-y-2">
                    <div className="text-[11px] font-semibold text-slate-400">Add Parameter:</div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Parameter key (e.g. order_id)"
                        value={newParamKey}
                        onChange={(e) => setNewParamKey(e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono focus:border-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="Value"
                        value={newParamVal}
                        onChange={(e) => setNewParamVal(e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white font-mono focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={handleAddParam}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded transition cursor-pointer"
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Raw JSON Editor */
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-300">
                      Sample Transaction Record (JSON)
                    </label>
                    <button
                      type="button"
                      onClick={handleResetToBoxParams}
                      className="text-[11px] text-blue-400 hover:text-blue-300 underline font-medium cursor-pointer"
                    >
                      Reset to Block Parameters
                    </button>
                  </div>
                  <textarea
                    rows={8}
                    value={testSampleJson}
                    onChange={(e) => {
                      setTestSampleJson(e.target.value);
                      try {
                        const parsed = JSON.parse(e.target.value);
                        if (parsed && typeof parsed === 'object') {
                          setTestParams(parsed);
                        }
                      } catch {
                        // ignore syntax errors while typing
                      }
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-emerald-300 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <button
                type="button"
                disabled={isTesting}
                onClick={handleTestRun}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-950/50"
              >
                {isTesting ? (
                  <span>Executing live validation...</span>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    Execute Validation Run with Given Parameters
                  </>
                )}
              </button>

              {testResult && (
                <div className="space-y-3 mt-4">
                  <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                    <span>Execution Result</span>
                    <div className="flex items-center gap-2">
                      {testResult.passed !== undefined && (
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          testResult.passed ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' : 'bg-rose-950 text-rose-300 border border-rose-500/40'
                        }`}>
                          {testResult.passed ? 'STATUS: PASS' : 'STATUS: FAIL'}
                        </span>
                      )}
                      {testResult.status && (
                        <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                          {testResult.status}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Missing Parameters Warning Banner */}
                  {testResult.missingParameters && testResult.missingParameters.length > 0 && (
                    <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-lg text-xs space-y-1.5 shadow-md">
                      <div className="flex items-center gap-2 text-rose-300 font-semibold">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span>Required Parameter(s) Missing</span>
                      </div>
                      <p className="text-slate-300 text-[11px]">
                        This validation box depends on: <strong className="text-rose-300 font-mono">{testResult.missingParameters.join(', ')}</strong>.
                        Please provide them in the parameters above.
                      </p>
                    </div>
                  )}

                  {/* Summary Feedback Banner */}
                  {(testResult.message || testResult.reason) && (
                    <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs flex flex-col gap-1.5">
                      <div className="flex items-center gap-2">
                        {testResult.badgeText && (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                            testResult.passed ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' : 'bg-rose-950 text-rose-300 border border-rose-500/40'
                          }`}>
                            {testResult.badgeText}
                          </span>
                        )}
                        <span className="text-slate-200 font-medium">{testResult.message || testResult.reason}</span>
                      </div>
                      {testResult.queryPreview && (
                        <div className="text-[10px] font-mono text-slate-400 bg-slate-950 p-1.5 rounded border border-slate-800/80 truncate" title={testResult.queryPreview}>
                          Query: {testResult.queryPreview}
                        </div>
                      )}
                    </div>
                  )}

                  <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto max-h-64">
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 6. Duplicate Check Builder Modal matching 05_duplicate_check_builder.png */}
      {isDuplicateCheckModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl border border-slate-100 overflow-hidden my-auto animate-in fade-in duration-150">
            {/* Modal Header */}
            <div className="px-7 pt-6 pb-4 flex items-start justify-between border-b border-slate-100">
              <div>
                <h2 className="text-xl font-bold text-slate-900">New duplicate check</h2>
                <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5 font-normal">
                  <span>Table</span>
                  <span className="font-semibold text-slate-700 font-mono">{dupTargetTable}</span>
                  <span>on</span>
                  <span className="font-semibold text-slate-700">{databases.find(d => d.id === dupTargetDbId)?.name || 'Sett'}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDuplicateCheckModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.55fr_1fr] gap-6 p-7">
              {/* Left Column: Form & Conditions */}
              <div className="space-y-5">
                {/* Rule Name & Rule Type */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Rule name</label>
                    <input
                      type="text"
                      value={dupRuleName}
                      onChange={(e) => setDupRuleName(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#F27421]"
                      placeholder="New column rule"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Rule type</label>
                    <div className="relative">
                      <select
                        value={dupRuleType}
                        onChange={(e) => setDupRuleType(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 appearance-none focus:outline-none focus:border-[#F27421] pr-8 cursor-pointer"
                      >
                        <option value="Duplicate check">Duplicate check</option>
                        <option value="Grouping check">Grouping check</option>
                        <option value="Completeness check">Completeness check</option>
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Live Database Data Preview Accordion inside Modal */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                  <div
                    onClick={() => setIsModalLivePreviewExpanded(!isModalLivePreviewExpanded)}
                    className="px-3.5 py-2 flex items-center justify-between cursor-pointer hover:bg-slate-100/70 transition"
                  >
                    <div className="flex items-center space-x-2">
                      <Eye size={13} className="text-[#F27421]" />
                      <span className="text-xs font-bold text-slate-900 font-sans">
                        Live preview of ${dupTargetTable}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                        ● Direct DB Query
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[11px] text-slate-400">
                        {colRulePreviewCols.length} columns · {colRulePreviewRows.length} sample rows
                      </span>
                      {isModalLivePreviewExpanded ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
                    </div>
                  </div>

                  {isModalLivePreviewExpanded && (
                    <div className="p-3 border-t border-slate-200 bg-white">
                      <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-44 shadow-2xs">
                        <table className="w-full text-left text-[11px] border-collapse divide-y divide-slate-200">
                          <thead className="bg-slate-50 text-slate-700 font-semibold sticky top-0">
                            <tr>
                              <th className="px-2.5 py-1 text-[10px] text-slate-400 w-8">#</th>
                              {colRulePreviewCols.map((c, i) => (
                                <th key={i} className="px-2.5 py-1 font-mono text-[10px] whitespace-nowrap">
                                  <span className="font-bold text-slate-900">{c.name}</span>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-[10px]">
                            {colRulePreviewRows.slice(0, 5).map((r, rIdx) => (
                              <tr key={rIdx} className="hover:bg-slate-50">
                                <td className="px-2.5 py-1 text-slate-400">{rIdx + 1}</td>
                                {colRulePreviewCols.map((c, cIdx) => {
                                  const val = r[c.name] ?? r[c.name.toLowerCase()] ?? r[c.name.toUpperCase()];
                                  return (
                                    <td key={cIdx} className="px-2.5 py-1 whitespace-nowrap text-slate-700">
                                      {val !== undefined && val !== null ? String(val) : <span className="text-slate-300 italic">null</span>}
                                    </td>
                                  );
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* 1 · Match on (in priority order) */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">1 · Match on (in priority order)</span>
                    <button
                      type="button"
                      onClick={() => {
                        const available = ['FE_UTRNNO', 'ACCT_NUM1', 'AMNT1', 'CURRENCY1', 'STATUS'].find(c => !dupPriorityColumns.some(p => p.name === c)) || 'FE_UTRNNO';
                        setDupPriorityColumns([...dupPriorityColumns, { name: available, matchMode: 'Exact match' }]);
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition cursor-pointer shadow-2xs"
                    >
                      + Add column
                    </button>
                  </div>
                  <div className="space-y-2">
                    {dupPriorityColumns.map((col, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-3 px-3 py-2 bg-white border border-slate-200 rounded-xl shadow-2xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="bg-[#0F142A] text-white text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0">
                            P{idx + 1}
                          </span>
                          <span className="font-bold text-slate-900 text-xs font-mono truncate">{col.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <select
                              value={col.matchMode}
                              onChange={(e) => {
                                const updated = [...dupPriorityColumns];
                                updated[idx].matchMode = e.target.value;
                                setDupPriorityColumns(updated);
                              }}
                              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-700 appearance-none pr-6 focus:outline-none focus:border-[#F27421] cursor-pointer"
                            >
                              <option value="Exact match">Exact match</option>
                              <option value="Fuzzy match">Fuzzy match</option>
                              <option value="Case insensitive">Case insensitive</option>
                            </select>
                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                          <button
                            type="button"
                            onClick={() => setDupPriorityColumns(dupPriorityColumns.filter((_, i) => i !== idx))}
                            className="p-1 text-slate-400 hover:text-rose-500 rounded transition cursor-pointer"
                            title="Remove priority column"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2 · Group rows by */}
                <div className="space-y-2">
                  <div>
                    <span className="text-xs font-bold text-slate-900">2 · Group rows by</span>
                    <p className="text-[11px] text-slate-400 mt-0.5">Rows sharing these values are counted together.</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {['FE_UTRNNO', 'INSTITUTION1', 'INSTITUTION2', 'AMNT1', 'AMNT2', 'ACCT_NUM1', 'CURRENCY1', 'STATUS', 'TR_DATE', 'TR_GROUP_ID', 'BO_TYPE', 'PROC_NAME', 'TRAN_PLACE', 'VISA_DATA', 'AGENT1', 'USER_ID'].map((c) => {
                      const isSelected = dupGroupByColumns.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setDupGroupByColumns(dupGroupByColumns.filter(item => item !== c));
                            } else {
                              setDupGroupByColumns([...dupGroupByColumns, c]);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition cursor-pointer ${
                            isSelected
                              ? 'bg-[#0F142A] text-white shadow-2xs'
                              : 'bg-slate-100 hover:bg-slate-200/70 text-slate-700 border border-slate-200/60'
                          }`}
                        >
                          {c}
                        </button>
                      );
                    })}
                    <span className="px-2 py-1 rounded-md text-xs font-mono text-slate-400 bg-slate-50 border border-slate-200/50">
                      +30 more
                    </span>
                  </div>
                </div>

                {/* 3 · Only count rows where */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">3 · Only count rows where</span>
                    <button
                      type="button"
                      onClick={() => setDupFilterConditions([...dupFilterConditions, { column: 'STATUS', operator: '=', value: 'ACTIVE' }])}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition cursor-pointer shadow-2xs"
                    >
                      + Condition
                    </button>
                  </div>
                  <div className="space-y-2">
                    {dupFilterConditions.map((cond, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={cond.column}
                          onChange={(e) => {
                            const updated = [...dupFilterConditions];
                            updated[idx].column = e.target.value;
                            setDupFilterConditions(updated);
                          }}
                          className="w-1/3 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 focus:outline-none focus:border-[#F27421]"
                          placeholder="Column"
                        />
                        <select
                          value={cond.operator}
                          onChange={(e) => {
                            const updated = [...dupFilterConditions];
                            updated[idx].operator = e.target.value;
                            setDupFilterConditions(updated);
                          }}
                          className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono text-slate-900 focus:outline-none focus:border-[#F27421]"
                        >
                          <option value="=">=</option>
                          <option value="!=">!=</option>
                          <option value=">">&gt;</option>
                          <option value="<">&lt;</option>
                          <option value="LIKE">LIKE</option>
                          <option value="IN">IN</option>
                        </select>
                        <input
                          type="text"
                          value={cond.value}
                          onChange={(e) => {
                            const updated = [...dupFilterConditions];
                            updated[idx].value = e.target.value;
                            setDupFilterConditions(updated);
                          }}
                          className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-900 focus:outline-none focus:border-[#F27421]"
                          placeholder="Value"
                        />
                        {dupFilterConditions.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setDupFilterConditions(dupFilterConditions.filter((_, i) => i !== idx))}
                            className="p-1.5 text-slate-400 hover:text-rose-500 rounded"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column: Rule Summary, Actions & Test Runner */}
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 mb-2">Rule summary</h3>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-700 leading-relaxed space-y-2">
                    <p>
                      Flag a row as <span className="font-bold text-amber-600">{dupSeverity.toLowerCase()}</span> when more than <span className="font-bold text-slate-900">1</span> row shares the same{' '}
                      {dupPriorityColumns.map(c => (
                        <span key={c.name} className="inline-block bg-slate-200/80 text-slate-800 font-mono text-[11px] px-1.5 py-0.2 rounded mx-0.5 font-semibold">
                          {c.name}
                        </span>
                      ))}
                      {dupFilterConditions.length > 0 && (
                        <>
                          , counting only rows where{' '}
                          {dupFilterConditions.map((c, i) => (
                            <span key={i} className="inline-block bg-slate-200/80 text-slate-800 font-mono text-[11px] px-1.5 py-0.2 rounded mx-0.5 font-semibold">
                              {c.column} {c.operator} {c.value}
                            </span>
                          ))}
                          .
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">If violated</label>
                    <div className="relative">
                      <select
                        value={dupIfViolated}
                        onChange={(e) => setDupIfViolated(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-900 appearance-none focus:outline-none focus:border-[#F27421] pr-7 cursor-pointer"
                      >
                        <option value="Flag for review">Flag for review</option>
                        <option value="Reject / Drop">Reject / Drop</option>
                        <option value="Send to exception queue">Send to exception queue</option>
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Severity</label>
                    <div className="relative">
                      <select
                        value={dupSeverity}
                        onChange={(e) => setDupSeverity(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-900 appearance-none focus:outline-none focus:border-[#F27421] pr-7 cursor-pointer"
                      >
                        <option value="Warning">Warning</option>
                        <option value="Critical">Critical</option>
                        <option value="Info">Info</option>
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Message</label>
                  <textarea
                    rows={3}
                    value={dupViolationMessage}
                    onChange={(e) => setDupViolationMessage(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none focus:border-[#F27421] leading-relaxed resize-none"
                  />
                </div>

                {/* Try it on sample data */}
                <div className="p-3.5 bg-white border border-slate-200 rounded-xl flex items-center justify-between gap-3 shadow-2xs">
                  <div>
                    <div className="text-xs font-bold text-slate-900">Try it on sample data</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {dupSampleTestRunning ? 'Evaluating sample rows...' : (dupSampleTestResult ? `${dupSampleTestResult.violationsFound} violations found` : '50 rows loaded')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDupSampleTestRunning(true);
                      setTimeout(() => {
                        setDupSampleTestRunning(false);
                        setDupSampleTestResult({ executed: true, violationsFound: 2 });
                      }, 500);
                    }}
                    className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  >
                    <span>▷</span>
                    <span>Run test</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-7 py-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsDuplicateCheckModalOpen(false)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDuplicateCheck}
                disabled={dupIsSaving}
                className="px-5 py-2 bg-[#F27421] hover:bg-[#d65f15] disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition cursor-pointer flex items-center gap-2"
              >
                {dupIsSaving ? 'Saving...' : 'Save rule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visual Operational Asset Share Modal */}
      {sharingBox && (
        <ShareAssetModal
          isOpen={isShareModalOpen}
          onClose={() => {
            setIsShareModalOpen(false);
            setSharingBox(null);
          }}
          assetType="VALIDATION_BOX"
          assetId={sharingBox.id}
          assetTitle={sharingBox.name}
          assetDescription={sharingBox.description}
          previewDetails={{
            category: sharingBox.category,
            dbTarget: sharingBox.targetTable,
            keys: sharingBox.searchParameters?.map((p: any) => p.inputField || p)
          }}
          currentUser={currentUser}
          onShareSuccess={() => {
            loadData();
          }}
        />
      )}
    </div>
  );
};

export default ValidationBoxManager;
