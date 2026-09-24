import React, { useState, useEffect, useMemo } from 'react';
import {
  Boxes,
  X,
  Check,
  ChevronRight,
  ChevronLeft,
  Database,
  CheckCircle2,
  Layers,
  Cpu,
  Table,
  ArrowRight,
  Sliders,
  AlertCircle,
  ShieldAlert,
  HelpCircle,
  Plus,
  Trash2,
  SlidersHorizontal,
  FileCheck2,
  Sparkles
} from 'lucide-react';
import { api } from '../../../api/client';
import { ValidationBox, ValidationBoxType, DatabaseConnection, DatabaseColumnConfiguration } from '../../../types';
import { globalMappingService } from '../../../services/globalMappingService';
import { showSystemAlert } from '../../common/MessageModal';

interface ValidationBoxWizardDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  editingBox: ValidationBox | null;
  initialBoxType?: ValidationBoxType;
  databases: DatabaseConnection[];
  onSaved: () => void;
}

type WizardStep = 1 | 2 | 3 | 4;

export const ValidationBoxWizardDrawer: React.FC<ValidationBoxWizardDrawerProps> = ({
  isOpen,
  onClose,
  editingBox,
  initialBoxType = 'INGESTION_SEARCH',
  databases,
  onSaved
}) => {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [saving, setSaving] = useState(false);

  // Step 1: Identity & Target
  const [boxType, setBoxType] = useState<ValidationBoxType>(initialBoxType);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Core Settlement');
  const [description, setDescription] = useState('');
  const [targetDbId, setTargetDbId] = useState('');
  const [targetTable, setTargetTable] = useState('');

  // Target schema discovery
  const [tableColumns, setTableColumns] = useState<{ name: string; type: string; nullable?: boolean; isPrimary?: boolean }[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [tableColumnConfigs, setTableColumnConfigs] = useState<DatabaseColumnConfiguration[]>([]);
  const [selectedColumnConfigIds, setSelectedColumnConfigIds] = useState<string[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(false);

  // Step 2: Type-specific matching logic
  // Ingestion Search
  const [searchParams, setSearchParams] = useState<{ inputField: string; targetColumn: string; required: boolean }[]>([
    { inputField: 'transaction_id', targetColumn: 'transaction_id', required: true }
  ]);

  // Condition Check (Dual Source vs Single)
  const [useDualSource, setUseDualSource] = useState(true);
  const [sourceAOrigin, setSourceAOrigin] = useState<'INPUT' | 'MIRROR' | 'LEG'>('INPUT');
  const [sourceAField, setSourceAField] = useState('amount');
  const [sourceALegKey, setSourceALegKey] = useState('ORIGINAL.DEBIT');
  const [sourceBOrigin, setSourceBOrigin] = useState<'INPUT' | 'MIRROR' | 'LEG'>('MIRROR');
  const [sourceBField, setSourceBField] = useState('amount');
  const [sourceBLegKey, setSourceBLegKey] = useState('REVERSAL.CREDIT');
  const [operator, setOperator] = useState('EQUALS');
  const [tolerance, setTolerance] = useState('0.00');
  const [lookupDictEntries, setLookupDictEntries] = useState<{ code: string; label: string }[]>([
    { code: '00', label: 'Approved' },
    { code: '05', label: 'Decline' }
  ]);
  const [evalField, setEvalField] = useState('amount');
  const [expectedValue, setExpectedValue] = useState('');
  const [showAdvancedCondition, setShowAdvancedCondition] = useState(false);

  // Reconciliation
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

  // Report Output
  const [outputColumns, setOutputColumns] = useState<{ source: 'INPUT' | 'MIRROR' | 'COMPUTED'; field: string; headerAlias: string }[]>([
    { source: 'INPUT', field: 'transaction_id', headerAlias: 'Transaction ID' },
    { source: 'INPUT', field: 'amount', headerAlias: 'Input Amount' },
    { source: 'MIRROR', field: 'amount', headerAlias: 'Host Amount' }
  ]);
  const [statusTargetField, setStatusTargetField] = useState('reconciliation_status');
  const [messageTemplate, setMessageTemplate] = useState('Transaction {{key}} processed with status {{status}}');

  // Step 4: Policy & Execution Actions
  const [severity, setSeverity] = useState('CRITICAL');
  const [actionSuccess, setActionSuccess] = useState('CONTINUE');
  const [actionFailure, setActionFailure] = useState('FLAG');

  // Selected database & available tables
  const selectedDb = useMemo(() => databases.find(d => d.id === targetDbId), [databases, targetDbId]);
  const availableTables = useMemo(() => selectedDb?.availableTables || selectedDb?.allowedTables || [], [selectedDb]);
  const globalStandardFields = useMemo(() => globalMappingService.getStandardFields(), []);
  const availableColumnNames = useMemo(() => Array.from(new Set(tableColumns.map(c => c.name))), [tableColumns]);

  // Derived set-based mirror table name
  const mirrorTableName = useMemo(() => {
    if (!targetDbId || !targetTable) return '';
    const dbName = selectedDb?.name || 'db';
    const cleanDb = dbName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const cleanTbl = targetTable.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    return `mirror_${cleanDb}_${cleanTbl}`;
  }, [targetDbId, targetTable, selectedDb]);

  // Populate form on open or change in editingBox
  useEffect(() => {
    if (!isOpen) return;
    setCurrentStep(1);

    if (editingBox) {
      setBoxType(editingBox.boxType);
      setName(editingBox.name);
      setDescription(editingBox.description || '');
      setCategory(editingBox.category || 'Core Settlement');
      const dbId = editingBox.targetDbId || (databases[0]?.id || '');
      const tbl = editingBox.targetTable || '';
      setTargetDbId(dbId);
      setTargetTable(tbl);
      setSelectedColumnConfigIds(editingBox.columnConfigurationIds || editingBox.checkStep?.columnConfigurationIds || []);

      if (editingBox.searchParameters && editingBox.searchParameters.length > 0) {
        setSearchParams(editingBox.searchParameters);
      } else {
        setSearchParams([{ inputField: 'transaction_id', targetColumn: 'transaction_id', required: true }]);
      }

      if (editingBox.dualSourceCondition || editingBox.checkStep?.dualSourceCondition) {
        const dsc = editingBox.dualSourceCondition || editingBox.checkStep?.dualSourceCondition;
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
          setShowAdvancedCondition(true);
        }
      } else {
        setUseDualSource(false);
      }

      if (editingBox.checkStep) {
        setEvalField(editingBox.checkStep.canonicalField || editingBox.checkStep.sourceField || 'amount');
        if (!editingBox.dualSourceCondition) {
          setOperator(editingBox.checkStep.operator || editingBox.checkStep.comparator || 'EQUALS');
        }
        setExpectedValue(editingBox.checkStep.expectedValue || editingBox.checkStep.compareValue || '');
        setTolerance((editingBox.checkStep.tolerance ?? editingBox.checkStep.toleranceMargin ?? 0).toString());
        setActionSuccess(editingBox.checkStep.actionOnSuccess || editingBox.checkStep.onPassAction || 'CONTINUE');
        setActionFailure(editingBox.checkStep.actionOnFailure || editingBox.checkStep.onFailAction || 'FLAG');
        setSeverity(editingBox.checkStep.severityOnFailure || 'CRITICAL');
      }

      if (editingBox.matchKeyInput) setMatchKeyInput(editingBox.matchKeyInput);
      if (editingBox.matchKeyExternal) setMatchKeyExternal(editingBox.matchKeyExternal);
      if (editingBox.multiRowPolicy) setMultiRowPolicy(editingBox.multiRowPolicy);
      if (editingBox.groupConfig) {
        setIsGroupedEnabled(true);
        setGroupIdField(editingBox.groupConfig.groupIdField || 'group_id');
        setEventPhaseField(editingBox.groupConfig.eventPhaseField || 'event_type');
        if (editingBox.groupConfig.eventPhaseMap) {
          setOrigValue(editingBox.groupConfig.eventPhaseMap.originalValue || 'FINANCIAL_REQ');
          setRevValue(editingBox.groupConfig.eventPhaseMap.reversalValue || 'REVERSAL');
          setRefValue(editingBox.groupConfig.eventPhaseMap.refundValue || 'REFUND');
        }
        if (editingBox.groupConfig.legIndicatorField) setLegIndicatorField(editingBox.groupConfig.legIndicatorField);
        if (editingBox.groupConfig.legIndicatorMap) {
          setDebitValue(editingBox.groupConfig.legIndicatorMap.debitValue || 'D');
          setCreditValue(editingBox.groupConfig.legIndicatorMap.creditValue || 'C');
          setFeeValue(editingBox.groupConfig.legIndicatorMap.feeValue || 'F');
        }
      } else {
        setIsGroupedEnabled(false);
      }

      if (editingBox.outputColumns && editingBox.outputColumns.length > 0) setOutputColumns(editingBox.outputColumns);
      if (editingBox.statusBinding) setStatusTargetField(editingBox.statusBinding.targetField || 'reconciliation_status');
      if (editingBox.messageTemplate) setMessageTemplate(editingBox.messageTemplate);
    } else {
      // New Box Defaults
      setBoxType(initialBoxType);
      if (initialBoxType === 'INGESTION_SEARCH') setName('Settlement Auth Query Block');
      else if (initialBoxType === 'RECONCILIATION') setName('External Host Reconciliation Block');
      else if (initialBoxType === 'REPORT') setName('Reconciliation Output & Status Report');
      else setName('Dual-Source Amount Integrity Check');

      setDescription('');
      setCategory('Core Settlement');
      const firstDb = databases[0];
      const firstDbId = firstDb?.id || '';
      const tbls = firstDb?.availableTables || firstDb?.allowedTables || [];
      const firstTable = tbls[0] || 'transactions';
      setTargetDbId(firstDbId);
      setTargetTable(firstTable);

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

      setOutputColumns([
        { source: 'INPUT', field: 'transaction_id', headerAlias: 'Transaction ID' },
        { source: 'INPUT', field: 'amount', headerAlias: 'Input Amount' },
        { source: 'MIRROR', field: 'amount', headerAlias: 'Host Amount' }
      ]);
      setStatusTargetField('reconciliation_status');
      setMessageTemplate('Transaction {{transaction_id}} verified: status={{status}}');
      setSelectedColumnConfigIds([]);
    }
  }, [isOpen, editingBox, initialBoxType, databases]);

  // Load target table columns and column configurations
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

  // Save handler
  const handleSave = async () => {
    if (!name.trim()) {
      setCurrentStep(1);
      showSystemAlert({
        title: 'Validation Error',
        message: 'Validation Box Name is required.',
        type: 'warning'
      });
      return;
    }

    setSaving(true);
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

      onSaved();
      onClose();
    } catch (err: any) {
      showSystemAlert({
        title: 'Save Failed',
        message: `Failed to save validation box: ${err.message || err}`,
        type: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex justify-end transition-opacity">
      <div className="bg-slate-900 border-l border-slate-800 w-full max-w-3xl h-full flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200">
        
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                {editingBox ? 'Edit Validation Box' : 'Create Validation Box'}
                <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                  Step {currentStep} of 4
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {currentStep === 1 && 'Define identity, box archetype, and target database structure'}
                {currentStep === 2 && `Configure ${boxType.replace('_', ' ')} matching logic & parameters`}
                {currentStep === 3 && 'Attach table-level column rules & quality constraints (optional)'}
                {currentStep === 4 && 'Configure execution actions, review summary, and finalize asset'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Navigation Bar */}
        <div className="px-6 py-2.5 bg-slate-950/40 border-b border-slate-800/80 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-2">
            {[
              { num: 1, label: 'Identity & Target' },
              { num: 2, label: 'Matching Logic' },
              { num: 3, label: 'Quality Rules' },
              { num: 4, label: 'Policy & Review' }
            ].map((step, idx) => (
              <React.Fragment key={step.num}>
                <button
                  type="button"
                  onClick={() => setCurrentStep(step.num as WizardStep)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition cursor-pointer ${
                    currentStep === step.num
                      ? 'bg-blue-600 text-white shadow-xs shadow-blue-500/20'
                      : currentStep > step.num
                      ? 'text-emerald-400 hover:bg-slate-800'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    currentStep === step.num ? 'bg-white text-blue-600' : currentStep > step.num ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {currentStep > step.num ? <Check className="w-3 h-3 stroke-[3]" /> : step.num}
                  </span>
                  <span>{step.label}</span>
                </button>
                {idx < 3 && <ChevronRight className="w-3.5 h-3.5 text-slate-700" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Drawer Body - Scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ================= STEP 1: IDENTITY & TARGET ================= */}
          {currentStep === 1 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              
              {/* Block Type Archetype Selector */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Select Box Archetype
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    {
                      type: 'INGESTION_SEARCH' as ValidationBoxType,
                      title: 'Search & Ingest',
                      desc: 'Query external tables & mirror data',
                      icon: Database,
                      color: 'emerald'
                    },
                    {
                      type: 'CONDITION_CHECK' as ValidationBoxType,
                      title: 'Condition Check',
                      desc: 'Dual-source or value comparator',
                      icon: CheckCircle2,
                      color: 'blue'
                    },
                    {
                      type: 'RECONCILIATION' as ValidationBoxType,
                      title: 'Reconciliation',
                      desc: 'Key matching & multi-leg legs',
                      icon: Layers,
                      color: 'cyan'
                    },
                    {
                      type: 'REPORT' as ValidationBoxType,
                      title: 'Report Output',
                      desc: 'Format output columns & verdicts',
                      icon: Cpu,
                      color: 'purple'
                    }
                  ].map((card) => {
                    const Icon = card.icon;
                    const isSelected = boxType === card.type;
                    return (
                      <button
                        key={card.type}
                        type="button"
                        onClick={() => setBoxType(card.type)}
                        className={`p-3 rounded-xl border text-left transition flex flex-col justify-between cursor-pointer ${
                          isSelected
                            ? card.color === 'emerald'
                              ? 'bg-emerald-950/40 border-emerald-500/80 shadow-xs'
                              : card.color === 'blue'
                              ? 'bg-blue-950/40 border-blue-500/80 shadow-xs'
                              : card.color === 'cyan'
                              ? 'bg-cyan-950/40 border-cyan-500/80 shadow-xs'
                              : 'bg-purple-950/40 border-purple-500/80 shadow-xs'
                            : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Icon className={`w-4 h-4 ${
                            isSelected
                              ? card.color === 'emerald' ? 'text-emerald-400' : card.color === 'blue' ? 'text-blue-400' : card.color === 'cyan' ? 'text-cyan-400' : 'text-purple-400'
                              : 'text-slate-500'
                          }`} />
                          {isSelected && <span className="w-2 h-2 rounded-full bg-blue-400"></span>}
                        </div>
                        <div>
                          <div className={`font-semibold text-xs ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                            {card.title}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                            {card.desc}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Basic Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Validation Box Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. CBS Host Settlement Search"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Category / Group</label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Core Settlement, Authorization, Fraud"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Explain what rule or verification this box enforces..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              {/* Target Data Structure */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                    <Table className="w-4 h-4 text-blue-400" />
                    <span>Target Data Structure Scope</span>
                  </div>
                  {loadingColumns ? (
                    <span className="text-[11px] text-amber-400 animate-pulse font-mono">Inspecting columns...</span>
                  ) : tableColumns.length > 0 ? (
                    <span className="text-[11px] text-emerald-400 font-mono bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                      ✓ {tableColumns.length} columns discovered
                    </span>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Target Database Engine</label>
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
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
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
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">Target Table / Collection</label>
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
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
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
                        placeholder="e.g. transactions, auth_log"
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                      />
                    )}
                  </div>
                </div>

                {mirrorTableName && (
                  <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between text-xs">
                    <span className="text-slate-400">PostgreSQL Set-Based Mirror:</span>
                    <span className="font-mono text-cyan-300 font-semibold bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40 text-[11px]">
                      {mirrorTableName}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================= STEP 2: MATCHING LOGIC ================= */}
          {currentStep === 2 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              
              {/* Type A: INGESTION SEARCH */}
              {boxType === 'INGESTION_SEARCH' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div>
                      <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Database className="w-3.5 h-3.5" /> Ingestion Search Parameters
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Choose the input correlation keys to look up in table <code className="text-emerald-300 font-mono font-semibold">{targetTable || 'target table'}</code>.
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
                        className="text-[11px] bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/60 px-2.5 py-1 rounded-lg font-medium transition cursor-pointer"
                      >
                        Select Required
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const currentFields = globalMappingService.getStandardFields();
                          setSearchParams(currentFields.map(f => ({
                            inputField: f.key,
                            targetColumn: targetDbId && targetTable ? globalMappingService.getPhysicalColumn(targetDbId, targetTable, f.key) : f.key,
                            required: !!f.required
                          })));
                        }}
                        className="text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 px-2 py-1 rounded-lg transition cursor-pointer"
                      >
                        Select All
                      </button>
                      {searchParams.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSearchParams([])}
                          className="text-[11px] text-slate-400 hover:text-rose-400 px-1 py-1 transition cursor-pointer"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Clean Global Parameter List */}
                  <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-900 max-h-72 overflow-y-auto">
                    {globalStandardFields.map((field) => {
                      const physicalCol = targetDbId && targetTable 
                        ? globalMappingService.getPhysicalColumn(targetDbId, targetTable, field.key)
                        : field.key;
                      const activeIdx = searchParams.findIndex(p => p.inputField === field.key);
                      const isSelected = activeIdx !== -1;

                      return (
                        <div
                          key={field.key}
                          onClick={() => {
                            if (isSelected) {
                              setSearchParams(searchParams.filter((_, i) => i !== activeIdx));
                            } else {
                              setSearchParams([...searchParams, { inputField: field.key, targetColumn: physicalCol, required: !!field.required }]);
                            }
                          }}
                          className={`px-3 py-2.5 flex items-center justify-between text-xs transition cursor-pointer select-none ${
                            isSelected ? 'bg-emerald-950/30 hover:bg-emerald-950/40' : 'hover:bg-slate-900/60 text-slate-400'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`font-mono text-xs font-semibold ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                                  {field.key}
                                </span>
                                <span className="text-[9px] uppercase px-1 rounded bg-slate-800 text-slate-400 font-mono">
                                  {field.dataType}
                                </span>
                                {field.required && (
                                  <span className="text-[9px] px-1 rounded bg-rose-950 text-rose-300 border border-rose-800 font-semibold">
                                    Req
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">{field.label}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5 text-[11px] font-mono">
                              <ArrowRight className="w-3 h-3 text-slate-600" />
                              <span className={`px-2 py-0.5 rounded border ${
                                isSelected ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60 font-semibold' : 'bg-slate-900 text-slate-400 border-slate-800'
                              }`}>
                                {physicalCol}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* SQL Preview Snippet */}
                  {searchParams.length > 0 && (
                    <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 text-slate-300">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span><strong>{searchParams.length}</strong> parameters active</span>
                      </div>
                      <div className="font-mono text-[10px] text-emerald-300/80 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 truncate max-w-md">
                        WHERE {searchParams.map(p => `"${p.targetColumn}" = :${p.inputField}`).join(' AND ')}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Type B: CONDITION CHECK */}
              {boxType === 'CONDITION_CHECK' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div>
                      <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Rule Evaluation Logic
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Define how fields are evaluated against constants or external mirrored host data.
                      </p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={useDualSource}
                        onChange={(e) => setUseDualSource(e.target.checked)}
                        className="w-3.5 h-3.5 rounded bg-slate-900 border-slate-700 text-blue-500 focus:ring-0"
                      />
                      <span>Dual-Source Comparison</span>
                    </label>
                  </div>

                  {useDualSource ? (
                    <div className="space-y-3 bg-slate-950/70 p-4 rounded-xl border border-slate-800 text-xs">
                      {/* Source A */}
                      <div className="grid grid-cols-12 gap-3 items-center">
                        <div className="col-span-4">
                          <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Source A Origin</label>
                          <select
                            value={sourceAOrigin}
                            onChange={(e) => {
                              const newOrigin = e.target.value as any;
                              setSourceAOrigin(newOrigin);
                              if (newOrigin === 'INPUT' && globalStandardFields.length > 0) setSourceAField(globalStandardFields[0].key);
                              else if ((newOrigin === 'MIRROR' || newOrigin === 'LEG') && availableColumnNames.length > 0) setSourceAField(availableColumnNames[0]);
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                          >
                            <option value="INPUT">Input File (Global List)</option>
                            <option value="MIRROR">External Mirror ({targetTable || 'Table'})</option>
                            <option value="LEG">Grouped Leg ({targetTable || 'Table'})</option>
                          </select>
                        </div>
                        <div className={sourceAOrigin === 'LEG' ? 'col-span-4' : 'col-span-8'}>
                          <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                            Source A Field {sourceAOrigin === 'INPUT' ? '(Global Schema)' : `(${targetTable || 'Table'})`}
                          </label>
                          {sourceAOrigin === 'INPUT' ? (
                            <select
                              value={sourceAField}
                              onChange={(e) => setSourceAField(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-blue-500"
                            >
                              {globalStandardFields.map(f => (
                                <option key={f.key} value={f.key}>{f.label} ({f.key})</option>
                              ))}
                            </select>
                          ) : availableColumnNames.length > 0 ? (
                            <select
                              value={sourceAField}
                              onChange={(e) => setSourceAField(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-blue-500"
                            >
                              {availableColumnNames.map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={sourceAField}
                              onChange={(e) => setSourceAField(e.target.value)}
                              placeholder="e.g. amount"
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                            />
                          )}
                        </div>
                        {sourceAOrigin === 'LEG' && (
                          <div className="col-span-4">
                            <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Leg Key</label>
                            <select
                              value={sourceALegKey}
                              onChange={(e) => setSourceALegKey(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                            >
                              <option value="ORIGINAL.DEBIT">ORIGINAL.DEBIT</option>
                              <option value="ORIGINAL.CREDIT">ORIGINAL.CREDIT</option>
                              <option value="ORIGINAL.FEE">ORIGINAL.FEE</option>
                              <option value="REVERSAL.DEBIT">REVERSAL.DEBIT</option>
                              <option value="REVERSAL.CREDIT">REVERSAL.CREDIT</option>
                            </select>
                          </div>
                        )}
                      </div>

                      {/* Comparator */}
                      <div className="grid grid-cols-2 gap-3 py-2 border-y border-slate-800/80">
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Comparison Operator</label>
                          <select
                            value={operator}
                            onChange={(e) => setOperator(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-blue-300 font-semibold"
                          >
                            <option value="EQUALS">Strict Equals (==)</option>
                            <option value="NUMERIC_TOLERANCE">Numeric Tolerance (± margin)</option>
                            <option value="NOT_EQUALS">Not Equals (!=)</option>
                            <option value="CONTAINS">Contains Substring</option>
                            <option value="GREATER_THAN">Greater Than (&gt;)</option>
                            <option value="LESS_THAN">Less Than (&lt;)</option>
                            <option value="LOOKUP_MAP">Dynamic Code Dictionary</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                            {operator === 'NUMERIC_TOLERANCE' ? 'Tolerance Margin (±)' : 'Tolerance (Optional)'}
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={tolerance}
                            onChange={(e) => setTolerance(e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                          />
                        </div>
                      </div>

                      {/* Source B */}
                      <div className="grid grid-cols-12 gap-3 items-center">
                        <div className="col-span-4">
                          <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Source B Origin</label>
                          <select
                            value={sourceBOrigin}
                            onChange={(e) => {
                              const newOrigin = e.target.value as any;
                              setSourceBOrigin(newOrigin);
                              if (newOrigin === 'INPUT' && globalStandardFields.length > 0) setSourceBField(globalStandardFields[0].key);
                              else if ((newOrigin === 'MIRROR' || newOrigin === 'LEG') && availableColumnNames.length > 0) setSourceBField(availableColumnNames[0]);
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                          >
                            <option value="MIRROR">External Mirror ({targetTable || 'Table'})</option>
                            <option value="INPUT">Input File (Global List)</option>
                            <option value="LEG">Grouped Leg ({targetTable || 'Table'})</option>
                          </select>
                        </div>
                        <div className={sourceBOrigin === 'LEG' ? 'col-span-4' : 'col-span-8'}>
                          <label className="block text-[10px] text-slate-400 mb-1 font-semibold">
                            Source B Field {sourceBOrigin === 'INPUT' ? '(Global Schema)' : `(${targetTable || 'Table'})`}
                          </label>
                          {sourceBOrigin === 'INPUT' ? (
                            <select
                              value={sourceBField}
                              onChange={(e) => setSourceBField(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-blue-500"
                            >
                              {globalStandardFields.map(f => (
                                <option key={f.key} value={f.key}>{f.label} ({f.key})</option>
                              ))}
                            </select>
                          ) : availableColumnNames.length > 0 ? (
                            <select
                              value={sourceBField}
                              onChange={(e) => setSourceBField(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-blue-500"
                            >
                              {availableColumnNames.map(c => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={sourceBField}
                              onChange={(e) => setSourceBField(e.target.value)}
                              placeholder="e.g. host_amount"
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                            />
                          )}
                        </div>
                        {sourceBOrigin === 'LEG' && (
                          <div className="col-span-4">
                            <label className="block text-[10px] text-slate-400 mb-1 font-semibold">Leg Key</label>
                            <select
                              value={sourceBLegKey}
                              onChange={(e) => setSourceBLegKey(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                            >
                              <option value="REVERSAL.CREDIT">REVERSAL.CREDIT</option>
                              <option value="ORIGINAL.DEBIT">ORIGINAL.DEBIT</option>
                              <option value="ORIGINAL.CREDIT">ORIGINAL.CREDIT</option>
                              <option value="ORIGINAL.FEE">ORIGINAL.FEE</option>
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Single field constant check */
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950/70 p-4 rounded-xl border border-slate-800">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Evaluated Field</label>
                        <select
                          value={evalField}
                          onChange={(e) => setEvalField(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono"
                        >
                          {globalStandardFields.map(f => (
                            <option key={f.key} value={f.key}>{f.label} ({f.key})</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Operator</label>
                        <select
                          value={operator}
                          onChange={(e) => setOperator(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                        >
                          <option value="EQUALS">Strict Equals (==)</option>
                          <option value="NOT_EQUALS">Not Equals (!=)</option>
                          <option value="CONTAINS">Contains</option>
                          <option value="GREATER_THAN">Greater Than</option>
                          <option value="LESS_THAN">Less Than</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">Expected Value</label>
                        <input
                          type="text"
                          value={expectedValue}
                          onChange={(e) => setExpectedValue(e.target.value)}
                          placeholder="e.g. 100.00, COMPLETED"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                        />
                      </div>
                    </div>
                  )}

                  {/* Progressive Disclosure: Code Dictionary */}
                  {operator === 'LOOKUP_MAP' && (
                    <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300">Custom Code Dictionary Entries</span>
                        <button
                          type="button"
                          onClick={() => setLookupDictEntries([...lookupDictEntries, { code: '', label: '' }])}
                          className="text-xs text-blue-400 hover:text-blue-300"
                        >
                          + Add Entry
                        </button>
                      </div>
                      <div className="space-y-1.5">
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
                              className="w-24 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white font-mono"
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
                              className="flex-1 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-white"
                            />
                            <button
                              type="button"
                              onClick={() => setLookupDictEntries(lookupDictEntries.filter((_, i) => i !== idx))}
                              className="text-slate-500 hover:text-rose-400 p-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Type C: RECONCILIATION */}
              {boxType === 'RECONCILIATION' && (
                <div className="space-y-4">
                  <div className="border-b border-slate-800 pb-2">
                    <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" /> Reconciliation Matching Keys
                    </h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Specify primary matching correlation keys between input transactions and host records.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Input Match Key <span className="text-emerald-400 font-mono text-[10px]">(Global Schema)</span>
                      </label>
                      <select
                        value={matchKeyInput}
                        onChange={(e) => setMatchKeyInput(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-cyan-500"
                      >
                        {globalStandardFields.map(f => (
                          <option key={f.key} value={f.key}>{f.label} ({f.key})</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        External DB Match Key <span className="text-cyan-400 font-mono text-[10px]">({targetTable || 'Table'})</span>
                      </label>
                      {availableColumnNames.length > 0 ? (
                        <select
                          value={matchKeyExternal}
                          onChange={(e) => setMatchKeyExternal(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:border-cyan-500"
                        >
                          {availableColumnNames.map(col => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={matchKeyExternal}
                          onChange={(e) => setMatchKeyExternal(e.target.value)}
                          placeholder="e.g. tran_id"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono"
                        />
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Multi-Row Policy</label>
                      <select
                        value={multiRowPolicy}
                        onChange={(e) => setMultiRowPolicy(e.target.value as any)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                      >
                        <option value="COMPOSITE_BUNDLE">Composite Bundle</option>
                        <option value="LATEST">Latest Record</option>
                        <option value="EARLIEST">Earliest Record</option>
                        <option value="AGGREGATE_SUM">Aggregate Sum</option>
                        <option value="STRICT_SINGLE">Strict Single Match</option>
                      </select>
                    </div>
                  </div>

                  {/* Multi-Leg Grouping Collapsible */}
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5 space-y-3">
                    <label className="flex items-center gap-2.5 cursor-pointer text-xs font-semibold text-white">
                      <input
                        type="checkbox"
                        checked={isGroupedEnabled}
                        onChange={(e) => setIsGroupedEnabled(e.target.checked)}
                        className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0"
                      />
                      <span>Enable Advanced Multi-Leg Grouping (Original, Reversal, Refund, Debit/Credit Legs)</span>
                    </label>

                    {isGroupedEnabled && (
                      <div className="space-y-3 pt-2 border-t border-slate-800 text-xs">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Group ID Column ({targetTable})</label>
                            <input
                              type="text"
                              value={groupIdField}
                              onChange={(e) => setGroupIdField(e.target.value)}
                              placeholder="e.g. utrnno"
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Event Phase Column ({targetTable})</label>
                            <input
                              type="text"
                              value={eventPhaseField}
                              onChange={(e) => setEventPhaseField(e.target.value)}
                              placeholder="e.g. event_type"
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Original Phase</label>
                            <input
                              type="text"
                              value={origValue}
                              onChange={(e) => setOrigValue(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Reversal Phase</label>
                            <input
                              type="text"
                              value={revValue}
                              onChange={(e) => setRevValue(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] text-slate-400 mb-0.5">Refund Phase</label>
                            <input
                              type="text"
                              value={refValue}
                              onChange={(e) => setRefValue(e.target.value)}
                              className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1 text-xs text-white"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Type D: REPORT OUTPUT */}
              {boxType === 'REPORT' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div>
                      <h4 className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5" /> Output Column Projection
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Project input and mirrored host fields into final report columns.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOutputColumns([
                          ...outputColumns,
                          { source: 'INPUT', field: globalStandardFields[0]?.key || 'transaction_id', headerAlias: 'New Column' }
                        ]);
                      }}
                      className="text-xs text-purple-400 hover:text-purple-300 font-medium"
                    >
                      + Add Column
                    </button>
                  </div>

                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {outputColumns.map((col, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-950 p-2 rounded-lg border border-slate-800 text-xs">
                        <div className="col-span-3">
                          <select
                            value={col.source}
                            onChange={(e) => {
                              const updated = [...outputColumns];
                              updated[idx].source = e.target.value as any;
                              setOutputColumns(updated);
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs text-white"
                          >
                            <option value="INPUT">Input File</option>
                            <option value="MIRROR">External Mirror</option>
                            <option value="COMPUTED">Computed</option>
                          </select>
                        </div>
                        <div className="col-span-4">
                          <input
                            type="text"
                            value={col.field}
                            onChange={(e) => {
                              const updated = [...outputColumns];
                              updated[idx].field = e.target.value;
                              setOutputColumns(updated);
                            }}
                            placeholder="Field key"
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white font-mono"
                          />
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
                            className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white"
                          />
                        </div>
                        <div className="col-span-1 flex justify-center">
                          <button
                            type="button"
                            onClick={() => setOutputColumns(outputColumns.filter((_, i) => i !== idx))}
                            className="text-slate-500 hover:text-rose-400 p-1"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Message Template</label>
                    <textarea
                      rows={2}
                      value={messageTemplate}
                      onChange={(e) => setMessageTemplate(e.target.value)}
                      placeholder="e.g. Transaction {{key}} processed with status {{status}}"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= STEP 3: QUALITY RULES & CONSTRAINTS ================= */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div>
                  <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5" /> Table-Level Quality Rules & Constraints
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Link pre-configured column rules (Completeness, Value Ranges, Duplicate checks) for <code className="text-indigo-300 font-mono">{targetTable || 'target table'}</code>.
                  </p>
                </div>
                {tableColumnConfigs.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedColumnConfigIds(tableColumnConfigs.map(c => c.id))}
                      className="text-[11px] bg-indigo-950/80 hover:bg-indigo-900 text-indigo-300 border border-indigo-800/60 px-2 py-1 rounded transition"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedColumnConfigIds([])}
                      className="text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800 px-2 py-1 rounded transition"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {loadingConfigs ? (
                <div className="py-8 text-center text-xs text-slate-400 animate-pulse">Loading column rules...</div>
              ) : tableColumnConfigs.length === 0 ? (
                <div className="p-6 bg-slate-950/60 border border-slate-800 rounded-xl text-center space-y-2">
                  <SlidersHorizontal className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-300 font-semibold">No Table Rules Defined Yet</p>
                  <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                    You can continue without table rules. To enforce completeness, uniqueness, or value boundaries, configure rules in the <strong>Database Column Configurations Studio</strong>.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
                  {tableColumnConfigs.map((cfg) => {
                    const isSelected = selectedColumnConfigIds.includes(cfg.id);
                    return (
                      <div
                        key={cfg.id}
                        onClick={() => {
                          if (isSelected) setSelectedColumnConfigIds(prev => prev.filter(id => id !== cfg.id));
                          else setSelectedColumnConfigIds(prev => [...prev, cfg.id]);
                        }}
                        className={`p-3 rounded-xl border text-xs cursor-pointer transition flex items-start gap-2.5 ${
                          isSelected
                            ? 'bg-indigo-950/40 border-indigo-500/80 shadow-xs'
                            : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-slate-700 hover:bg-slate-900/40'
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
                            <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded border bg-indigo-950 text-indigo-300 border-indigo-800">
                              {cfg.ruleType.replace('_CHECK', '')}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            Columns: {cfg.columns?.map(c => c.columnName).join(', ') || 'N/A'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ================= STEP 4: POLICY & REVIEW ================= */}
          {currentStep === 4 && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="border-b border-slate-800 pb-2">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <FileCheck2 className="w-3.5 h-3.5 text-blue-400" /> Pipeline Execution Policies & Asset Review
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Configure pipeline action on rule pass or failure, then verify the box specification.
                </p>
              </div>

              {/* Execution Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-950/70 p-4 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Severity on Failure</label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white"
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Action on Success</label>
                  <select
                    value={actionSuccess}
                    onChange={(e) => setActionSuccess(e.target.value)}
                    className={`w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold ${
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
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Action on Failure</label>
                  <select
                    value={actionFailure}
                    onChange={(e) => setActionFailure(e.target.value)}
                    className={`w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold ${
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

              {/* Review Summary Card */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                  <span className="font-semibold text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" /> Asset Review Summary
                  </span>
                  <span className="font-mono text-[11px] text-blue-400 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800/40">
                    {boxType}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500">Box Name:</span>
                    <p className="font-semibold text-white">{name || 'Unnamed'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Category:</span>
                    <p className="font-semibold text-white">{category || 'General'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Target Table:</span>
                    <p className="font-mono text-emerald-300 font-semibold">{targetTable || 'None'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Mirror Table:</span>
                    <p className="font-mono text-cyan-300 text-[11px]">{mirrorTableName || 'N/A'}</p>
                  </div>
                  <div>
                    <span className="text-slate-500">Active Rules:</span>
                    <p className="text-slate-300">
                      {boxType === 'INGESTION_SEARCH' && `${searchParams.length} Search Parameters`}
                      {boxType === 'CONDITION_CHECK' && `${operator} (${sourceAField} vs ${sourceBField})`}
                      {boxType === 'RECONCILIATION' && `Match: ${matchKeyInput} <-> ${matchKeyExternal}`}
                      {boxType === 'REPORT' && `${outputColumns.length} Output Columns`}
                    </p>
                  </div>
                  <div>
                    <span className="text-slate-500">Table Quality Rules:</span>
                    <p className="text-indigo-300 font-semibold">{selectedColumnConfigIds.length} Linked</p>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Drawer Footer */}
        <div className="px-6 py-3.5 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between shrink-0">
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={() => setCurrentStep((currentStep - 1) as WizardStep)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium transition cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" /> Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg text-slate-400 hover:text-white text-xs font-medium transition cursor-pointer"
            >
              Cancel
            </button>

            {currentStep < 4 ? (
              <button
                type="button"
                onClick={() => {
                  if (currentStep === 1 && !name.trim()) {
                    showSystemAlert({
                      title: 'Validation Error',
                      message: 'Please provide a Validation Box Name.',
                      type: 'warning'
                    });
                    return;
                  }
                  setCurrentStep((currentStep + 1) as WizardStep);
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-xs shadow-blue-500/20 transition cursor-pointer"
              >
                Next Step <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow-sm shadow-emerald-500/20 transition cursor-pointer"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                {saving ? 'Saving...' : editingBox ? 'Update Validation Box' : 'Create Validation Box'}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
