import React, { useState, useEffect, useMemo } from 'react';
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
  AlertCircle
} from 'lucide-react';
import { api } from '../../api/client';
import { ValidationBox, ValidationBoxType, DatabaseConnection } from '../../types';
import { globalMappingService } from '../../services/globalMappingService';

interface ValidationBoxManagerProps {
  currentUser?: any;
}

export const ValidationBoxManager: React.FC<ValidationBoxManagerProps> = () => {
  const [boxes, setBoxes] = useState<ValidationBox[]>([]);
  const [databases, setDatabases] = useState<DatabaseConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'ALL' | ValidationBoxType>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBox, setEditingBox] = useState<ValidationBox | null>(null);

  // Form state
  const [boxType, setBoxType] = useState<ValidationBoxType>('INGESTION_SEARCH');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Core Settlement');
  const [targetDbId, setTargetDbId] = useState('');
  const [targetTable, setTargetTable] = useState('');
  const [searchParams, setSearchParams] = useState<{ inputField: string; targetColumn: string; required: boolean }[]>([
    { inputField: 'transactionId', targetColumn: 'tran_id', required: true }
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
  const [testSampleJson, setTestSampleJson] = useState('{\n  "transactionId": "TXN-9021",\n  "amount": 149.99,\n  "currency": "USD",\n  "status": "COMPLETED"\n}');
  const [testResult, setTestResult] = useState<any>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [vBoxes, dbs] = await Promise.all([
        api.getValidationBoxes(),
        api.getDatabases(),
        globalMappingService.fetchConfigFromBackend()
      ]);
      setBoxes(vBoxes || []);
      setDatabases(dbs || []);
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

  useEffect(() => {
    if (targetDbId && targetTable) {
      setLoadingColumns(true);
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
    } else {
      setTableColumns([]);
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
          severityOnFailure: severity,
          actionOnSuccess: actionSuccess,
          actionOnFailure: actionFailure,
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
      alert(`Failed to save validation box: ${err.message}`);
    }
  };

  const handleDeleteBox = async (id: string, boxName: string) => {
    if (!confirm(`Are you sure you want to delete Validation Box "${boxName}"?`)) return;
    try {
      await api.deleteValidationBox(id);
      loadData();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleTestRun = async () => {
    if (!testingBox) return;
    setIsTesting(true);
    setTestResult(null);
    try {
      let parsed = {};
      try {
        parsed = JSON.parse(testSampleJson);
      } catch {
        alert('Invalid JSON in test payload');
        setIsTesting(false);
        return;
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
    const matchesSearch = b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.category && b.category.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (b.targetTable && b.targetTable.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesType && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded-lg">
                <Boxes className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-wide">Validation Boxes (Standalone Rule Blocks)</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                Modular Architecture
              </span>
            </div>
            <p className="text-sm text-slate-400 max-w-2xl">
              Create autonomous modular rules separating <strong>Search & External Ingestion</strong> (with auto-provisioned PostgreSQL mirror accounts) from <strong>Condition Checks</strong> (tolerances, code validations, thresholds).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleOpenCreateModal('INGESTION_SEARCH')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium text-xs transition-colors shadow-sm"
            >
              <Database className="w-3.5 h-3.5" />
              + Search Box
            </button>
            <button
              onClick={() => handleOpenCreateModal('RECONCILIATION')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium text-xs transition-colors shadow-sm"
            >
              <Layers className="w-3.5 h-3.5" />
              + Reconciliation Box
            </button>
            <button
              onClick={() => handleOpenCreateModal('CONDITION_CHECK')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium text-xs transition-colors shadow-sm"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              + Condition Check
            </button>
            <button
              onClick={() => handleOpenCreateModal('REPORT')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium text-xs transition-colors shadow-sm"
            >
              <Cpu className="w-3.5 h-3.5" />
              + Report Box
            </button>
          </div>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 border border-slate-200 rounded-xl shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedTypeFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedTypeFilter === 'ALL'
                ? 'bg-slate-900 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            All Boxes ({boxes.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedTypeFilter('INGESTION_SEARCH')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedTypeFilter === 'INGESTION_SEARCH'
                ? 'bg-emerald-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Search ({boxes.filter(b => b.boxType === 'INGESTION_SEARCH').length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedTypeFilter('RECONCILIATION')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedTypeFilter === 'RECONCILIATION'
                ? 'bg-cyan-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-cyan-700 hover:bg-cyan-50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Reconciliation ({boxes.filter(b => b.boxType === 'RECONCILIATION').length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedTypeFilter('CONDITION_CHECK')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedTypeFilter === 'CONDITION_CHECK'
                ? 'bg-blue-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-blue-700 hover:bg-blue-50'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            Condition ({boxes.filter(b => b.boxType === 'CONDITION_CHECK').length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedTypeFilter('REPORT')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              selectedTypeFilter === 'REPORT'
                ? 'bg-purple-600 text-white shadow-xs font-bold'
                : 'text-slate-600 hover:text-purple-700 hover:bg-purple-50'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            Report ({boxes.filter(b => b.boxType === 'REPORT').length})
          </button>
        </div>

        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search validation boxes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-4 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Grid of Validation Boxes */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 animate-pulse font-medium">Loading validation boxes...</div>
      ) : filteredBoxes.length === 0 ? (
        <div className="p-12 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          <Boxes className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800 mb-1">No Validation Boxes found</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
            Build standalone rule blocks to separate external querying from integrity checks before linking them in the Workflow Studio.
          </p>
          <div className="flex justify-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => handleOpenCreateModal('INGESTION_SEARCH')}
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              + Add Search Box
            </button>
            <button
              type="button"
              onClick={() => handleOpenCreateModal('CONDITION_CHECK')}
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              + Add Condition Check
            </button>
            <button
              type="button"
              onClick={() => handleOpenCreateModal('RECONCILIATION')}
              className="px-3 py-1.5 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 border border-cyan-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              + Add Reconciliation Box
            </button>
            <button
              type="button"
              onClick={() => handleOpenCreateModal('REPORT')}
              className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
            >
              + Add Report Box
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredBoxes.map((box) => {
            const getTypeMeta = () => {
              switch (box.boxType) {
                case 'INGESTION_SEARCH':
                  return {
                    label: 'Search & Ingest',
                    icon: Database,
                    iconBg: 'bg-emerald-50 border-emerald-200',
                    iconColor: 'text-emerald-700',
                    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  };
                case 'RECONCILIATION':
                  return {
                    label: 'Reconciliation',
                    icon: Layers,
                    iconBg: 'bg-cyan-50 border-cyan-200',
                    iconColor: 'text-cyan-700',
                    badge: 'bg-cyan-50 text-cyan-700 border-cyan-200'
                  };
                case 'REPORT':
                  return {
                    label: 'Report Output',
                    icon: Cpu,
                    iconBg: 'bg-purple-50 border-purple-200',
                    iconColor: 'text-purple-700',
                    badge: 'bg-purple-50 text-purple-700 border-purple-200'
                  };
                case 'CONDITION_CHECK':
                default:
                  return {
                    label: 'Condition Check',
                    icon: CheckCircle2,
                    iconBg: 'bg-blue-50 border-blue-200',
                    iconColor: 'text-blue-700',
                    badge: 'bg-blue-50 text-blue-700 border-blue-200'
                  };
              }
            };
            const meta = getTypeMeta();
            const Icon = meta.icon;

            return (
              <div
                key={box.id}
                className="group relative bg-white hover:bg-slate-50/50 border border-slate-200 hover:border-slate-300 rounded-xl p-4 flex flex-col justify-between transition-all duration-200 shadow-xs hover:shadow-md"
              >
                <div>
                  {/* Header: Icon + Title + Category + Actions */}
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`p-2 rounded-lg shrink-0 border ${meta.iconBg}`}>
                        <Icon className={`w-4 h-4 ${meta.iconColor}`} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 text-sm truncate group-hover:text-blue-600 transition-colors" title={box.name}>
                          {box.name}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border ${meta.badge}`}>
                            {meta.label}
                          </span>
                          {box.category && (
                            <span className="text-[10px] text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.2 rounded font-medium">
                              {box.category}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(box)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer"
                        title="Edit Box"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBox(box.id, box.name)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Delete Box"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Description */}
                  {box.description && (
                    <p className="text-xs text-slate-500 line-clamp-2 mb-3 leading-relaxed">
                      {box.description}
                    </p>
                  )}

                  {/* Dedicated Target Data Structure Bar */}
                  <div className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded-lg border border-slate-100 mb-3">
                    <span className="text-slate-600 flex items-center gap-1.5 truncate">
                      <Server className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-semibold text-slate-800 truncate max-w-[130px]">
                        {databases.find(d => d.id === box.targetDbId)?.name || 'Database'}
                      </span>
                    </span>
                    <span className="text-blue-700 font-mono text-[11px] font-bold bg-white px-2 py-0.5 rounded border border-slate-200 truncate max-w-[150px] flex items-center gap-1">
                      <Table className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="truncate">{box.targetTable || 'target_table'}</span>
                    </span>
                  </div>

                  {/* 1. Ingestion Search Card Body */}
                  {box.boxType === 'INGESTION_SEARCH' && (
                    <div className="space-y-2 mb-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                        <span>Search Parameters</span>
                        <span className="font-mono text-slate-500">{box.searchParameters?.length || 0} active</span>
                      </div>
                      {box.searchParameters && box.searchParameters.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {box.searchParameters.slice(0, 3).map((p, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-50 text-slate-700 border border-slate-200 text-[11px] font-mono"
                              title={`${p.inputField} -> ${p.targetColumn}`}
                            >
                              <span className="text-slate-500">{p.inputField}</span>
                              <ArrowRight className="w-2.5 h-2.5 text-slate-400" />
                              <span className="font-bold text-slate-800">{p.targetColumn}</span>
                              {p.required && <span className="text-rose-500 text-[9px] font-bold">*</span>}
                            </span>
                          ))}
                          {box.searchParameters.length > 3 && (
                            <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-mono">
                              +{box.searchParameters.length - 3} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No parameters configured</span>
                      )}
                    </div>
                  )}

                  {/* 2. Condition Check Card Body */}
                  {box.boxType === 'CONDITION_CHECK' && (
                    <div className="space-y-2 mb-3">
                      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                        <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1 flex items-center justify-between">
                          <span>Rule Condition</span>
                          {box.dualSourceCondition && (
                            <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-mono font-bold">Dual-Source</span>
                          )}
                        </div>
                        {box.dualSourceCondition ? (
                          <div className="space-y-1 font-mono text-xs">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-blue-700 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                {box.dualSourceCondition.sourceA.origin}:{box.dualSourceCondition.sourceA.field}
                              </span>
                              <span className="text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-bold text-[11px]">
                                {box.dualSourceCondition.comparator === 'EQUALS' ? '==' : box.dualSourceCondition.comparator}
                              </span>
                              <span className="text-slate-800 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">
                                {box.dualSourceCondition.sourceB.origin}:{box.dualSourceCondition.sourceB.field}
                              </span>
                            </div>
                            {box.dualSourceCondition.toleranceMargin !== undefined && box.dualSourceCondition.toleranceMargin > 0 && (
                              <div className="text-[10px] text-slate-500">
                                Tolerance: <span className="font-bold text-slate-700">±{box.dualSourceCondition.toleranceMargin}</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 font-mono text-xs flex-wrap">
                            <span className="text-blue-700 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">
                              {box.checkStep?.canonicalField || box.checkStep?.sourceField || 'amount'}
                            </span>
                            <span className="text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-bold text-[11px]">
                              {box.checkStep?.operator === 'EQUALS' ? '==' : (box.checkStep?.operator || '==')}
                            </span>
                            <span className="text-slate-800 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-200">
                              {box.checkStep?.expectedValue || 'match'}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                        <span>Outcomes:</span>
                        <div className="flex items-center gap-1.5 text-xs font-semibold">
                          <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[10px] font-bold">
                            Pass: {box.checkStep?.actionOnSuccess || 'CONTINUE'}
                          </span>
                          <span className="text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded text-[10px] font-bold">
                            Fail: {box.checkStep?.actionOnFailure || 'FLAG'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3. Reconciliation Card Body */}
                  {box.boxType === 'RECONCILIATION' && (
                    <div className="space-y-2 mb-3">
                      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 space-y-1.5">
                        <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center justify-between">
                          <span>Reconciliation Keys</span>
                          <span className="text-[9px] bg-cyan-100 text-cyan-800 px-1.5 py-0.2 rounded font-mono font-bold">
                            {box.multiRowPolicy || 'COMPOSITE_BUNDLE'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 font-mono text-xs text-slate-800">
                          <span className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-700 font-bold">
                            {box.matchKeyInput || 'transaction_id'}
                          </span>
                          <ArrowRight className="w-3 h-3 text-cyan-600 shrink-0" />
                          <span className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-cyan-800 font-bold">
                            {box.matchKeyExternal || 'tran_id'}
                          </span>
                        </div>
                        {box.groupConfig && (
                          <div className="text-[10px] text-slate-500 flex items-center gap-1 pt-1 border-t border-slate-200/60">
                            <Layers className="w-3 h-3 text-cyan-600" />
                            <span>Group ID: <strong className="font-mono text-slate-700">{box.groupConfig.groupIdField || 'group_id'}</strong></span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 4. Report Card Body */}
                  {box.boxType === 'REPORT' && (
                    <div className="space-y-2 mb-3">
                      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5 space-y-1.5">
                        <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center justify-between">
                          <span>Report Projection</span>
                          <span className="font-mono text-purple-700 text-[10px] font-bold bg-purple-50 px-1.5 py-0.2 rounded border border-purple-200">
                            {box.outputColumns?.length || 0} output cols
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-slate-700">
                          <span className="text-slate-400 text-[11px]">Status Column:</span>
                          <span className="font-mono text-purple-800 font-bold bg-white border border-slate-200 px-1.5 py-0.5 rounded text-[11px]">
                            {box.statusBinding?.targetField || 'reconciliation_status'}
                          </span>
                        </div>
                        {box.outputColumns && box.outputColumns.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-200/60">
                            {box.outputColumns.slice(0, 3).map((col, i) => (
                              <span key={i} className="text-[10px] font-mono bg-white border border-slate-200 px-1.5 py-0.2 rounded text-slate-600">
                                {col.headerAlias || col.field}
                              </span>
                            ))}
                            {box.outputColumns.length > 3 && (
                              <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1 rounded">
                                +{box.outputColumns.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer with Test Run button */}
                <div className="pt-2.5 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setTestingBox(box);
                      setTestResult(null);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 text-xs font-semibold border border-slate-200 hover:border-slate-300 transition cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 text-emerald-600 fill-emerald-600/20" /> Test Block
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Create/Edit Validation Box */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <Boxes className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-white text-lg">
                  {editingBox ? 'Edit Validation Box' : 'Create New Validation Box'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBox} className="p-6 space-y-5">
              {/* Type Switcher */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Block Type
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setBoxType('INGESTION_SEARCH')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold transition-all ${
                      boxType === 'INGESTION_SEARCH'
                        ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <Database className={`w-3.5 h-3.5 ${boxType === 'INGESTION_SEARCH' ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span>Search & Ingest</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBoxType('CONDITION_CHECK')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold transition-all ${
                      boxType === 'CONDITION_CHECK'
                        ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <CheckCircle2 className={`w-3.5 h-3.5 ${boxType === 'CONDITION_CHECK' ? 'text-blue-400' : 'text-slate-500'}`} />
                    <span>Condition Check</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBoxType('RECONCILIATION')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold transition-all ${
                      boxType === 'RECONCILIATION'
                        ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <Layers className={`w-3.5 h-3.5 ${boxType === 'RECONCILIATION' ? 'text-cyan-400' : 'text-slate-500'}`} />
                    <span>Reconciliation</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setBoxType('REPORT')}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-semibold transition-all ${
                      boxType === 'REPORT'
                        ? 'bg-purple-600/20 text-purple-300 border border-purple-500/40 shadow-sm'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    <Cpu className={`w-3.5 h-3.5 ${boxType === 'REPORT' ? 'text-purple-400' : 'text-slate-500'}`} />
                    <span>Report Output</span>
                  </button>
                </div>
              </div>

              {/* General details */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Validation Box Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. CBS Auth Table Query"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Category</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Settlement, Authorization, Fraud"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Explain what this standalone rule evaluates or queries..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Dedicated Target Data Structure: Every Box is Scoped to a Target Table */}
              <div className="border-t border-slate-800 pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                    <Table className="w-4 h-4 text-blue-400" />
                    <span>Dedicated Target Data Structure</span>
                  </div>
                  <span className="text-[11px] font-mono">
                    {loadingColumns ? (
                      <span className="text-amber-400 animate-pulse">Inspecting table columns...</span>
                    ) : tableColumns.length > 0 ? (
                      <span className="text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                        ✓ {tableColumns.length} columns discovered in {targetTable}
                      </span>
                    ) : targetTable ? (
                      <span className="text-slate-400 bg-slate-800 px-2 py-0.5 rounded">Standard Schema mapped</span>
                    ) : null}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Target Database Engine *</label>
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
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
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
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Target Table / Collection *</label>
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
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
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
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 font-mono"
                      />
                    )}
                  </div>
                </div>

                {targetDbId && targetTable && (
                  <div className="bg-cyan-950/30 border border-cyan-800/40 rounded-lg p-2.5 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="text-slate-300">Set-Based PostgreSQL Mirror:</span>
                    </div>
                    <span className="font-mono text-cyan-300 font-bold bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-700/50 text-[11px]">
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
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-emerald-400 font-semibold"
                      >
                        <option value="CONTINUE">CONTINUE</option>
                        <option value="RECONCILE">RECONCILE</option>
                        <option value="CLOSE_PASS">CLOSE_PASS</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">On Failure</label>
                      <select
                        value={actionFailure}
                        onChange={(e) => setActionFailure(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-rose-400 font-semibold"
                      >
                        <option value="FLAG">FLAG</option>
                        <option value="STOP">STOP</option>
                        <option value="ESCALATE">ESCALATE</option>
                        <option value="RETRY">RETRY</option>
                      </select>
                    </div>
                  </div>
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
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Sample Transaction Record (JSON)
                </label>
                <textarea
                  rows={6}
                  value={testSampleJson}
                  onChange={(e) => setTestSampleJson(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs text-emerald-300 focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="button"
                disabled={isTesting}
                onClick={handleTestRun}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-semibold text-xs transition-colors flex items-center justify-center gap-2"
              >
                {isTesting ? (
                  <span>Executing live validation...</span>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-white" />
                    Execute Validation Run
                  </>
                )}
              </button>

              {testResult && (
                <div className="space-y-2 mt-4">
                  <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                    <span>Execution Result</span>
                    {testResult.passed !== undefined && (
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                        testResult.passed ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40' : 'bg-rose-950 text-rose-300 border border-rose-500/40'
                      }`}>
                        {testResult.passed ? 'STATUS: PASS' : 'STATUS: FAIL'}
                      </span>
                    )}
                  </div>
                  <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto max-h-72">
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
