/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  User, DatabaseConnection, GlobalTransactionSchemaField,
  ValidationCheckStep, DatabaseValidationWorkflow, ProcessingStage,
  ValidationResultStatus, PipelineAction, TransactionInvestigationStatus,
  TransactionExecutionSummary
} from '../../types';
import { globalMappingService } from '../../services/globalMappingService';
import { executeWorkflowForTransaction } from '../../services/investigationEngine';
import { api } from '../../api/client';
import { 
  ShieldCheck, Database, Plus, Trash2, Edit3, CheckCircle2, 
  AlertTriangle, Play, Save, RotateCcw, Copy, Check, ArrowRight,
  GitBranch, Sliders, Layers, Filter, Terminal, Sparkles, X,
  KeyRound, ChevronRight, Info, HelpCircle, Code2, RefreshCw,
  Workflow, Compass, CheckSquare, Eye, ArrowDownRight, Zap,
  Clock, CreditCard, FileSearch, ShieldAlert, CheckCircle, XCircle, Tag
} from 'lucide-react';
import { QuerySandbox } from '../investigation/QuerySandbox';


export function normalizeWorkflow(wf: any): DatabaseValidationWorkflow {
  if (!wf || typeof wf !== 'object') {
    return {
      id: `wf-${Date.now()}`,
      name: 'Untitled Workflow',
      description: '',
      targetDbId: '',
      targetTable: '',
      category: 'Settlement',
      stages: [],
      steps: [],
      version: '2.2.0'
    };
  }

  const defaultStages: ProcessingStage[] = [
    {
      id: `stage-${wf.id || 'wf'}-1`,
      name: 'Stage 1: Authorization & Ingress Verification',
      description: 'Primary validation of incoming transaction authorization records in the gateway node',
      order: 1,
      enabled: true,
      targetDbId: wf.targetDbId || '',
      targetDataSource: wf.targetTable || '',
      businessMeaning: 'Authorization Ingress'
    },
    {
      id: `stage-${wf.id || 'wf'}-2`,
      name: 'Stage 2: Clearing & Settlement Verification',
      description: 'Financial posting, ledger status, and downstream reconciliation checks',
      order: 2,
      enabled: true,
      targetDbId: wf.targetDbId || '',
      targetDataSource: wf.targetTable || '',
      businessMeaning: 'Financial Settlement'
    }
  ];

  const stages = Array.isArray(wf.stages) && wf.stages.length > 0 ? wf.stages : defaultStages;

  const steps: ValidationCheckStep[] = (Array.isArray(wf.steps) ? wf.steps : []).map((s: any, idx: number) => ({
    ...s,
    stageId: s?.stageId || (idx < 2 ? stages[0].id : (stages[1]?.id || stages[0].id)),
    requiredParams: Array.isArray(s?.requiredParams) ? s.requiredParams : [],
    optionalParams: Array.isArray(s?.optionalParams) ? s.optionalParams : [],
    onPassAction: s?.onPassAction || 'CONTINUE',
    onFailAction: s?.onFailAction || (idx === ((wf.steps?.length || 1) - 1) ? 'STOP' : 'CONTINUE'),
    onErrorAction: s?.onErrorAction || 'STOP'
  }));

  return {
    ...wf,
    id: wf.id || `wf-${Date.now()}`,
    name: wf.name || 'Untitled Workflow',
    description: wf.description || '',
    targetDbId: wf.targetDbId || '',
    targetTable: wf.targetTable || '',
    category: wf.category || 'Settlement',
    stages,
    steps,
    version: wf.version || '2.2.0'
  };
}

const DEFAULT_WORKFLOWS: DatabaseValidationWorkflow[] = [];

const STORAGE_KEY = 'operational_validation_workflows_v1';

// 1-Click Operational Rule Blueprints
interface RuleBlueprint {
  id: string;
  name: string;
  category: string;
  icon: any;
  summary: string;
  stepTemplate: Partial<ValidationCheckStep>;
}

const RULE_BLUEPRINTS: RuleBlueprint[] = [
  {
    id: 'bp-existence',
    name: 'Record Found in DB',
    category: 'Integrity',
    icon: Database,
    summary: 'Verify that an entity record exists in the target database table.',
    stepTemplate: {
      name: 'Entity Existence Verification',
      checkType: 'EXISTENCE_CHECK',
      sourceField: 'transaction_id',
      targetField: 'id',
      requiredParams: ['transaction_id'],
      successMessage: 'Entity record verified in target database table.',
      failureMessage: 'Entity record does not exist in target database table (404).',
      severityOnFailure: 'CRITICAL'
    }
  },
  {
    id: 'bp-status-check',
    name: 'Status Matches Value',
    category: 'State',
    icon: CheckSquare,
    summary: 'Confirm a field has transitioned to a specific state (e.g. SETTLED, SHIPPED).',
    stepTemplate: {
      name: 'Field Status Verification',
      checkType: 'FIELD_COMPARATOR',
      sourceField: 'status',
      comparator: '=',
      compareValue: 'SETTLED',
      requiredParams: ['transaction_id'],
      successMessage: 'Field status successfully matched target criteria.',
      failureMessage: 'Field status did not match expected value.',
      severityOnFailure: 'WARNING'
    }
  },
  {
    id: 'bp-iso-decline',
    name: 'Bank ISO Decline Diagnostic',
    category: 'Payments',
    icon: CreditCard,
    summary: 'Check response codes and flag bank decline codes (05, 51, 14, 96).',
    stepTemplate: {
      name: 'ISO Decline Code Diagnostic',
      checkType: 'ISO_DECLINE_CODE',
      sourceField: 'response_code',
      requiredParams: ['transaction_id'],
      successMessage: 'Transaction approved clean with zero bank decline codes.',
      failureMessage: 'Transaction declined with ISO response code.',
      severityOnFailure: 'WARNING'
    }
  },
  {
    id: 'bp-sla-time',
    name: 'Timestamp SLA Check',
    category: 'SLA',
    icon: Clock,
    summary: 'Validate timestamps occurred within defined SLA limits (e.g. ≤ 24h).',
    stepTemplate: {
      name: '24-Hour SLA Delivery Check',
      checkType: 'SQL_CONDITION',
      sqlCondition: 'TIMESTAMPDIFF(HOUR, created_at, updated_at) <= 24',
      requiredParams: ['order_id', 'date_range'],
      successMessage: 'Operation completed within the defined SLA time window.',
      failureMessage: 'Operation exceeded SLA threshold window.',
      severityOnFailure: 'WARNING'
    }
  },
  {
    id: 'bp-fallback-audit',
    name: 'Fallback Audit on Failure',
    category: 'Recovery',
    icon: ShieldAlert,
    summary: 'Execute recovery or ledger verification if the preceding step failed.',
    stepTemplate: {
      name: 'Ledger Reversal Audit on Failure',
      checkType: 'FIELD_COMPARATOR',
      dependencyCondition: 'IF_PREV_FAILURE',
      sourceField: 'status',
      comparator: '=',
      compareValue: 'REVERSED',
      requiredParams: ['transaction_id'],
      successMessage: 'Ledger successfully adjusted to REVERSED upon failure.',
      failureMessage: 'Unreversed ledger discrepancy detected during audit.',
      severityOnFailure: 'CRITICAL'
    }
  }
];

interface DatabaseValidationSettingsProps {
  currentUser: User;
  databases?: DatabaseConnection[];
}

export default function DatabaseValidationSettings({
  currentUser,
  databases = []
}: DatabaseValidationSettingsProps) {
  const dbList = useMemo(() => {
    return Array.isArray(databases) ? databases : [];
  }, [databases]);

  const [workflows, setWorkflows] = useState<DatabaseValidationWorkflow[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(normalizeWorkflow);
        }
      }
    } catch {
      // Fallback
    }
    return [];
  });

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>(workflows[0]?.id || '');
  const [isEditing, setIsEditing] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<DatabaseValidationWorkflow | null>(() => workflows[0] || null);
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'editor' | 'pipeline'>('editor');
  const [editorSubTab, setEditorSubTab] = useState<'rules' | 'stages'>('rules');
  const [showBlueprintDrawer, setShowBlueprintDrawer] = useState(false);
  const [saveSuccessBanner, setSaveSuccessBanner] = useState(false);
  const [newRequiredParamInput, setNewRequiredParamInput] = useState('');

  // Global Mapping Schema Fields & Configuration
  const [globalSchemaFields, setGlobalSchemaFields] = useState<GlobalTransactionSchemaField[]>(() => {
    try {
      const cfg = globalMappingService.getConfig();
      const std = cfg.standardFields || globalMappingService.getStandardFields();
      const custom = (cfg as any).customFields || [];
      const map = new Map<string, GlobalTransactionSchemaField>();
      [...std, ...custom].forEach(f => {
        if (f && f.key && !map.has(f.key)) {
          map.set(f.key, f);
        }
      });
      return Array.from(map.values());
    } catch {
      return globalMappingService.getStandardFields();
    }
  });

  const globalMappingVersion = useMemo(() => {
    try {
      return globalMappingService.getConfig().version || '2.2.0';
    } catch {
      return '2.2.0';
    }
  }, []);

  const refreshGlobalSchema = () => {
    try {
      const cfg = globalMappingService.getConfig();
      const std = cfg.standardFields || globalMappingService.getStandardFields();
      const custom = (cfg as any).customFields || [];
      const map = new Map<string, GlobalTransactionSchemaField>();
      [...std, ...custom].forEach(f => {
        if (f && f.key && !map.has(f.key)) {
          map.set(f.key, f);
        }
      });
      setGlobalSchemaFields(Array.from(map.values()));
    } catch (e) {
      console.warn('Failed to refresh global schema:', e);
    }
  };

  // Test Runner State - prefilled with Global Mapping Schema defaults
  const [testInputs, setTestInputs] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {
      transaction_id: 'TXN-9021',
      card_number: '4111********9982',
      amount_usd: '149.99',
      status_state: 'PENDING',
      created_at: '2026-07-11T04:12:00Z',
      user_email: 'customer@domain.com',
      merchant_id: 'AMAZON.COM*OPERATIONS',
      response_code: '00',
      currency: 'USD',
      terminal_id: 'TERM-08',
      order_id: 'ORD-99201',
      date_range: '2026-08-30 to 2026-08-31',
      customer_id: 'CUST-441'
    };
    try {
      const std = globalMappingService.getStandardFields();
      std.forEach(f => {
        if (f.key && f.exampleValue && !initial[f.key]) {
          initial[f.key] = f.exampleValue;
        }
      });
    } catch {
      // ignore
    }
    return initial;
  });

  const [isRunningTest, setIsRunningTest] = useState(false);
  const [testExecutionSummary, setTestExecutionSummary] = useState<TransactionExecutionSummary | null>(null);

  // Modal state for naming and creating a new rule
  const [showNewRuleModal, setShowNewRuleModal] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleDescription, setNewRuleDescription] = useState('');
  const [newRuleStageId, setNewRuleStageId] = useState('');
  const [newRuleCheckType, setNewRuleCheckType] = useState<ValidationCheckStep['checkType']>('FIELD_COMPARATOR');

  // Modal state for naming and creating a new workflow
  const [showNewWorkflowModal, setShowNewWorkflowModal] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowDescription, setNewWorkflowDescription] = useState('');
  const [newWorkflowCategory, setNewWorkflowCategory] = useState<DatabaseValidationWorkflow['category']>('Settlement');
  const [newWorkflowDbId, setNewWorkflowDbId] = useState('');
  const [newWorkflowTable, setNewWorkflowTable] = useState('');

  // Design-Time Query Sandbox toggle
  const [showQuerySandbox, setShowQuerySandbox] = useState(false);

  // Sync workflows from Backend API on mount
  useEffect(() => {
    let isMounted = true;
    api.getWorkflows()
      .then(data => {
        if (isMounted) {
          if (Array.isArray(data) && data.length > 0) {
            const normalized = data.map(normalizeWorkflow);
            setWorkflows(normalized);
            setSelectedWorkflowId(normalized[0].id);
            setEditingWorkflow(normalized[0]);
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
            } catch { /* ignore */ }
          } else {
            setWorkflows([]);
            setSelectedWorkflowId('');
            setEditingWorkflow(null);
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
            } catch { /* ignore */ }
          }
        }
      })
      .catch(err => {
        console.warn('Backend getWorkflows warning, using local store:', err);
      });
    return () => { isMounted = false; };
  }, []);

  const selectedWorkflow = useMemo(() => {
    return (workflows || []).find(w => w.id === selectedWorkflowId) || workflows[0] || null;
  }, [workflows, selectedWorkflowId]);

  // Dynamically collect all distinct parameters across all steps in the current workflow
  const allWorkflowParams = useMemo(() => {
    const set = new Set<string>();
    (editingWorkflow?.steps || []).forEach(s => {
      (s.requiredParams || []).forEach(p => { if (p && p.trim()) set.add(p.trim()); });
      (s.optionalParams || []).forEach(p => { if (p && p.trim()) set.add(p.trim()); });
    });
    if (set.size === 0) {
      set.add('order_id');
      set.add('transaction_id');
    }
    return Array.from(set);
  }, [editingWorkflow]);

  const activeWorkflowRequiredParams = useMemo(() => {
    const set = new Set<string>();
    (editingWorkflow?.steps || []).forEach(s => {
      (s.requiredParams || []).forEach(p => { if (p && p.trim()) set.add(p.trim()); });
    });
    return set;
  }, [editingWorkflow]);

  const activeWorkflowOptionalParams = useMemo(() => {
    const set = new Set<string>();
    (editingWorkflow?.steps || []).forEach(s => {
      (s.optionalParams || []).forEach(p => { if (p && p.trim()) set.add(p.trim()); });
    });
    return set;
  }, [editingWorkflow]);

  const activeWorkflowStageMap = useMemo(() => {
    const map = new Map<string, ProcessingStage>();
    (editingWorkflow?.stages || []).forEach(st => { if (st && st.id) map.set(st.id, st); });
    return map;
  }, [editingWorkflow]);

  const activeWorkflowTargetDatabases = useMemo(() => {
    const set = new Set<string>();
    if (editingWorkflow?.targetDbId) set.add(editingWorkflow.targetDbId);
    (editingWorkflow?.stages || []).forEach(st => { if (st && st.targetDbId) set.add(st.targetDbId); });
    (editingWorkflow?.steps || []).forEach(sp => { if (sp && sp.targetDbId) set.add(sp.targetDbId); });
    return set;
  }, [editingWorkflow]);

  useEffect(() => {
    if (selectedWorkflow && !isEditing) {
      setEditingWorkflow(selectedWorkflow);
      setActiveStepIndex(0);
    }
  }, [selectedWorkflow, isEditing]);

  const handleSaveWorkflows = async (updatedList: DatabaseValidationWorkflow[]) => {
    setWorkflows(updatedList);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedList));
      setSaveSuccessBanner(true);
      setTimeout(() => setSaveSuccessBanner(false), 3000);
    } catch (err) {
      console.warn('Failed to save validation workflows to localStorage:', err);
    }

    if (editingWorkflow) {
      try {
        await api.saveWorkflow(editingWorkflow);
      } catch {
        try {
          await api.updateWorkflow(editingWorkflow.id, editingWorkflow);
        } catch (e) {
          console.warn('API saveWorkflow fallback warning:', e);
        }
      }
    }
  };

  const handleOpenNewWorkflowModal = () => {
    setNewWorkflowName('');
    setNewWorkflowDescription('');
    setNewWorkflowCategory('Settlement');
    const defaultDbId = dbList[0]?.id || '';
    setNewWorkflowDbId(defaultDbId);
    const dbObj = dbList.find(d => d.id === defaultDbId);
    const allowed = (dbObj?.allowedTables && dbObj.allowedTables.length > 0)
      ? dbObj.allowedTables
      : (dbObj?.availableTables || []);
    setNewWorkflowTable(allowed[0] || '');
    setShowNewWorkflowModal(true);
  };

  const handleConfirmCreateWorkflow = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedName = newWorkflowName.trim();
    if (!trimmedName) {
      alert('Please enter a name for the workflow.');
      return;
    }

    const newWfId = `wf-${Date.now()}`;
    const selectedDbId = newWorkflowDbId || dbList[0]?.id || '';
    const dbObj = dbList.find(d => d.id === selectedDbId);
    const allowed = (dbObj?.allowedTables && dbObj.allowedTables.length > 0)
      ? dbObj.allowedTables
      : (dbObj?.availableTables || []);
    const chosenTable = newWorkflowTable || allowed[0] || '';

    const initialStage: ProcessingStage = {
      id: `stage-${newWfId}-1`,
      name: 'Stage 1: Primary Authorization Ingress',
      description: 'Initial verification of incoming transaction authorizations',
      order: 1,
      enabled: true,
      targetDbId: selectedDbId,
      targetDataSource: chosenTable,
      businessMeaning: 'Authorization Ingress'
    };

    const newWf: DatabaseValidationWorkflow = {
      id: newWfId,
      name: trimmedName,
      description: newWorkflowDescription.trim() || `Multi-stage validation workflow for ${trimmedName}`,
      targetDbId: selectedDbId,
      targetTable: chosenTable,
      category: newWorkflowCategory || 'Custom',
      version: '1.0.0',
      globalSuccessMessage: 'All sequential validation checks passed successfully across stages.',
      globalFailureMessage: 'One or more sequential validation checks failed criteria.',
      createdBy: currentUser.username || 'Admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stages: [initialStage],
      steps: [
        {
          id: `step-${Date.now()}-1`,
          stepNumber: 1,
          name: `${trimmedName} - Step 1: Existence Check`,
          description: 'Verify if the specified entity exists in the target database.',
          stageId: initialStage.id,
          checkType: 'EXISTENCE_CHECK',
          targetDbId: selectedDbId,
          targetTable: chosenTable,
          sourceField: 'transaction_id',
          targetField: 'transaction_id',
          requiredParams: ['transaction_id'],
          optionalParams: ['amount'],
          dependencyCondition: 'ALWAYS',
          holdStateVariable: 'foundRecords',
          onPassAction: 'CONTINUE',
          onFailAction: 'STOP',
          onErrorAction: 'STOP',
          successMessage: 'Entity record successfully found.',
          failureMessage: 'Record does not exist in target database table (404).',
          severityOnFailure: 'CRITICAL'
        }
      ]
    };

    const next = [newWf, ...workflows];
    handleSaveWorkflows(next);
    setSelectedWorkflowId(newWf.id);
    setEditingWorkflow(newWf);
    setShowNewWorkflowModal(false);
    setIsEditing(true);
    setActiveStepIndex(0);
  };

  const handleCreateNewWorkflow = () => {
    handleOpenNewWorkflowModal();
  };

  const handleDeleteWorkflow = async (id: string) => {
    if (confirm('Are you sure you want to delete this validation workflow?')) {
      const next = workflows.filter(w => w.id !== id);
      setWorkflows(next);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        setSaveSuccessBanner(true);
        setTimeout(() => setSaveSuccessBanner(false), 2000);
      } catch (err) {
        console.warn('Failed to save to localStorage:', err);
      }
      if (selectedWorkflowId === id) {
        const nextActive = next[0] || null;
        setSelectedWorkflowId(nextActive?.id || '');
        setEditingWorkflow(nextActive);
      }
      try {
        await api.deleteWorkflow(id);
      } catch (err) {
        console.warn('API deleteWorkflow warning:', err);
      }
    }
  };

  const handleSaveCurrentWorkflow = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const updated = {
      ...editingWorkflow,
      updatedAt: new Date().toISOString()
    };
    const next = workflows.map(w => w.id === updated.id ? updated : w);
    handleSaveWorkflows(next);
    setIsEditing(false);
  };

  // Stage Management in Editor
  const handleAddStage = () => {
    const nextOrder = (editingWorkflow.stages?.length || 0) + 1;
    const newStage: ProcessingStage = {
      id: `stage-${Date.now()}-${nextOrder}`,
      name: `Stage ${nextOrder}: Business Processing Stage`,
      description: 'Define external processing stage parameters and data source mapping',
      order: nextOrder,
      enabled: true,
      targetDbId: databases[0]?.id || 'db-1',
      targetDataSource: 'transactions',
      businessMeaning: 'Operational Lifecycle Stage'
    };
    const nextStages = [...(editingWorkflow.stages || []), newStage];
    setEditingWorkflow({ ...editingWorkflow, stages: nextStages });
  };

  const handleUpdateStage = (stageId: string, updates: Partial<ProcessingStage>) => {
    const nextStages = (editingWorkflow.stages || []).map(st => st.id === stageId ? { ...st, ...updates } : st);
    setEditingWorkflow({ ...editingWorkflow, stages: nextStages });
  };

  const handleRemoveStage = (stageId: string) => {
    if ((editingWorkflow.stages?.length || 0) <= 1) {
      alert('A workflow must maintain at least one processing stage.');
      return;
    }
    const nextStages = (editingWorkflow.stages || []).filter(st => st.id !== stageId).map((st, idx) => ({ ...st, order: idx + 1 }));
    const fallbackStageId = nextStages[0]?.id;
    const nextSteps = editingWorkflow.steps.map(s => s.stageId === stageId ? { ...s, stageId: fallbackStageId } : s);
    setEditingWorkflow({ ...editingWorkflow, stages: nextStages, steps: nextSteps });
  };

  // Step Management in Editor
  const handleOpenNewRuleModal = () => {
    if (!editingWorkflow) return;
    const nextNum = (editingWorkflow.steps?.length || 0) + 1;
    setNewRuleName(`Rule ${nextNum}: `);
    setNewRuleStageId(editingWorkflow.stages?.[0]?.id || '');
    setNewRuleCheckType('FIELD_COMPARATOR');
    setNewRuleDescription('');
    setShowNewRuleModal(true);
  };

  const handleConfirmCreateRule = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingWorkflow) return;
    const trimmedName = newRuleName.trim();
    if (!trimmedName) {
      alert('Please enter a name for the rule.');
      return;
    }

    const nextNum = (editingWorkflow.steps?.length || 0) + 1;
    const targetStageId = newRuleStageId || editingWorkflow.stages?.[0]?.id;
    const newStep: ValidationCheckStep = {
      id: `step-${Date.now()}-${nextNum}`,
      stepNumber: nextNum,
      name: trimmedName,
      description: newRuleDescription.trim() || `Validation check for ${trimmedName}`,
      stageId: targetStageId,
      checkType: newRuleCheckType,
      targetDbId: editingWorkflow.targetDbId,
      targetTable: editingWorkflow.targetTable,
      sourceField: 'transaction_id',
      comparator: '=',
      compareValue: 'SETTLED',
      requiredParams: ['transaction_id'],
      optionalParams: [],
      dependencyCondition: nextNum === 1 ? 'ALWAYS' : 'IF_PREV_SUCCESS',
      holdStateVariable: `step${nextNum}Output`,
      onPassAction: 'CONTINUE',
      onFailAction: 'STOP',
      onErrorAction: 'STOP',
      successMessage: `${trimmedName} passed criteria.`,
      failureMessage: `${trimmedName} failed validation.`,
      severityOnFailure: 'WARNING'
    };

    const nextSteps = [...(editingWorkflow.steps || []), newStep];
    setEditingWorkflow({ ...editingWorkflow, steps: nextSteps });
    setActiveStepIndex(nextSteps.length - 1);
    setShowNewRuleModal(false);
    setIsEditing(true);
  };

  const handleAddStep = () => {
    handleOpenNewRuleModal();
  };

  const handleApplyBlueprint = (blueprint: RuleBlueprint) => {
    if (!editingWorkflow) return;
    const nextNum = (editingWorkflow.steps?.length || 0) + 1;
    const defaultStageId = editingWorkflow.stages?.[0]?.id;
    const newStep: ValidationCheckStep = {
      id: `step-${Date.now()}-${nextNum}`,
      stepNumber: nextNum,
      name: `Step ${nextNum}: ${blueprint.stepTemplate.name || blueprint.name}`,
      description: blueprint.summary,
      stageId: defaultStageId,
      checkType: blueprint.stepTemplate.checkType || 'EXISTENCE_CHECK',
      targetDbId: editingWorkflow.targetDbId,
      targetTable: editingWorkflow.targetTable,
      sourceField: blueprint.stepTemplate.sourceField || 'transaction_id',
      comparator: blueprint.stepTemplate.comparator || '=',
      compareValue: blueprint.stepTemplate.compareValue || '',
      sqlCondition: blueprint.stepTemplate.sqlCondition || '',
      requiredParams: blueprint.stepTemplate.requiredParams || ['transaction_id'],
      optionalParams: [],
      dependencyCondition: blueprint.stepTemplate.dependencyCondition || (nextNum === 1 ? 'ALWAYS' : 'IF_PREV_SUCCESS'),
      holdStateVariable: `step${nextNum}Output`,
      onPassAction: blueprint.stepTemplate.onPassAction || 'CONTINUE',
      onFailAction: blueprint.stepTemplate.onFailAction || 'STOP',
      onErrorAction: blueprint.stepTemplate.onErrorAction || 'STOP',
      successMessage: blueprint.stepTemplate.successMessage || 'Step passed criteria.',
      failureMessage: blueprint.stepTemplate.failureMessage || 'Step failed validation.',
      severityOnFailure: blueprint.stepTemplate.severityOnFailure || 'WARNING'
    };

    const nextSteps = [...(editingWorkflow.steps || []), newStep];
    setEditingWorkflow({ ...editingWorkflow, steps: nextSteps });
    setActiveStepIndex(nextSteps.length - 1);
    setIsEditing(true);
    setShowBlueprintDrawer(false);
  };

  const handleRemoveStep = (index: number) => {
    if (editingWorkflow.steps.length <= 1) return;
    const nextSteps = editingWorkflow.steps.filter((_, i) => i !== index).map((s, idx) => ({
      ...s,
      stepNumber: idx + 1
    }));
    setEditingWorkflow({ ...editingWorkflow, steps: nextSteps });
    setActiveStepIndex(Math.max(0, index - 1));
  };

  const handleUpdateActiveStep = (updates: Partial<ValidationCheckStep>) => {
    const nextSteps = editingWorkflow.steps.map((s, i) => i === activeStepIndex ? { ...s, ...updates } : s);
    setEditingWorkflow({ ...editingWorkflow, steps: nextSteps });
  };

  // Test Runner Simulation using the Centralized Shared Investigation Engine
  const handleRunSimulation = () => {
    if (!editingWorkflow) return;
    setIsRunningTest(true);
    setTimeout(() => {
      const summary = executeWorkflowForTransaction(testInputs, editingWorkflow);
      setTestExecutionSummary(summary);
      setIsRunningTest(false);
    }, 300);
  };

  // 1-Click Scenario Preset Runner for Testing All 6 Mandatory Combinations
  const handleRunPresetScenario = (scenario: 'PASS_CONTINUE' | 'PASS_CLOSE' | 'FAIL_CONTINUE' | 'FAIL_CLOSE' | 'FAIL_STOP' | 'ERROR_STOP') => {
    if (!editingWorkflow) return;
    setIsRunningTest(true);
    setTimeout(() => {
      const clonedWf: DatabaseValidationWorkflow = JSON.parse(JSON.stringify(editingWorkflow));
      const firstStep = clonedWf.steps?.[0];
      if (!firstStep) {
        setIsRunningTest(false);
        return;
      }
      const mockInputs: Record<string, any> = { ...testInputs };

      if (scenario === 'PASS_CONTINUE') {
        firstStep.onPassAction = 'CONTINUE';
        mockInputs.transaction_id = 'TXN-9021';
        mockInputs.response_code = '00';
      } else if (scenario === 'PASS_CLOSE') {
        firstStep.onPassAction = 'CLOSE';
        mockInputs.transaction_id = 'TXN-9021';
        mockInputs.response_code = '00';
      } else if (scenario === 'FAIL_CONTINUE') {
        firstStep.onFailAction = 'CONTINUE';
        mockInputs.simulatedMissing = true;
        mockInputs.order_id = 'ORD-FAIL-TEST';
      } else if (scenario === 'FAIL_CLOSE') {
        firstStep.onFailAction = 'CLOSE';
        mockInputs.simulatedMissing = true;
        mockInputs.order_id = 'ORD-FAIL-TEST';
      } else if (scenario === 'FAIL_STOP') {
        firstStep.onFailAction = 'STOP';
        mockInputs.simulatedMissing = true;
        mockInputs.order_id = 'ORD-FAIL-TEST';
      } else if (scenario === 'ERROR_STOP') {
        firstStep.onErrorAction = 'STOP';
        firstStep.checkType = 'SQL_CONDITION';
        firstStep.sqlCondition = 'SELECT * FROM SYNTAX_ERROR_FAIL';
      }

      const summary = executeWorkflowForTransaction(mockInputs, clonedWf);
      setTestExecutionSummary(summary);
      setIsRunningTest(false);
    }, 300);
  };


  const activeStep = editingWorkflow?.steps?.[activeStepIndex] || editingWorkflow?.steps?.[0];

  // Natural Language Rule Summary Generator
  const naturalLanguageRuleSentence = useMemo(() => {
    if (!activeStep) return { params: 'none', target: 'DB', criteria: 'Valid', dep: 'Always' };
    const params = (activeStep.requiredParams && activeStep.requiredParams.length > 0) ? activeStep.requiredParams.join(', ') : 'no parameters';
    const dbObj = dbList.find(d => d.id === activeStep.targetDbId);
    const target = `${dbObj?.name || 'DB'} > ${activeStep.targetTable || 'table'}`;
    
    let criteria = '';
    if (activeStep.checkType === 'EXISTENCE_CHECK') {
      criteria = `Record must exist in ${activeStep.targetTable || 'table'}`;
    } else if (activeStep.checkType === 'FIELD_COMPARATOR') {
      criteria = `${activeStep.sourceField || 'field'} ${activeStep.comparator || '='} '${activeStep.compareValue || ''}'`;
    } else if (activeStep.checkType === 'ISO_DECLINE_CODE') {
      criteria = `response_code must be '00' (No Bank Decline Codes)`;
    } else if (activeStep.checkType === 'SQL_CONDITION') {
      criteria = activeStep.sqlCondition || 'Custom SQL Predicate';
    } else {
      criteria = `${activeStep.checkType} matches`;
    }

    const dep = activeStep.dependencyCondition === 'ALWAYS' ? 'Always' :
                activeStep.dependencyCondition === 'IF_PREV_SUCCESS' ? 'If previous step passes' :
                activeStep.dependencyCondition === 'IF_PREV_FAILURE' ? 'If previous step fails (Fallback)' : 'Conditionally';

    return { params, target, criteria, dep };
  }, [activeStep, dbList]);

  return (
    <div className="space-y-4">
      {/* 1. Header Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg border border-blue-400/30">
              <ShieldCheck size={18} />
            </div>
            <h2 className="text-sm font-bold">Database Validation Rules & Workflows</h2>
          </div>
          <p className="text-[11px] text-slate-400">
            Build multi-step sequential validation rules, conditional logic pipelines, and custom error diagnostics.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowBlueprintDrawer(!showBlueprintDrawer)}
            className="px-3 py-1.5 bg-blue-950/80 hover:bg-blue-900/90 text-blue-300 border border-blue-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
          >
            <Sparkles size={13} className="text-blue-400" />
            <span>1-Click Rule Blueprints</span>
          </button>

          <button
            type="button"
            onClick={() => setShowQuerySandbox(!showQuerySandbox)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border ${
              showQuerySandbox
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                : 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border-emerald-700/60'
            }`}
            title="Open Design-Time Query Sandbox to configure required data extraction"
          >
            <Database size={13} />
            <span>Query Sandbox & Extraction</span>
          </button>

          <button
            type="button"
            onClick={handleOpenNewWorkflowModal}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition shadow-xs cursor-pointer"
            title="Name and create a new validation workflow"
          >
            <Plus size={13} />
            <span>New Workflow</span>
          </button>
        </div>
      </div>

      {/* Design-Time Query Sandbox Drawer */}
      {showQuerySandbox && (
        <QuerySandbox
          workflow={editingWorkflow}
          stages={editingWorkflow.stages || []}
          databaseConnections={databases}
          onClose={() => setShowQuerySandbox(false)}
        />
      )}

      {/* 1-Click Blueprints Shelf */}
      {showBlueprintDrawer && (
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles size={13} className="text-blue-400" />
              <span>Select Pre-Built Operational Blueprint to Add as Step:</span>
            </span>
            <button
              type="button"
              onClick={() => setShowBlueprintDrawer(false)}
              className="text-slate-400 hover:text-white text-xs p-1"
            >
              <X size={14} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {RULE_BLUEPRINTS.map(bp => {
              const Icon = bp.icon;
              return (
                <div
                  key={bp.id}
                  onClick={() => handleApplyBlueprint(bp)}
                  className="p-3 bg-slate-950 hover:bg-blue-950/40 border border-slate-800 hover:border-blue-500/50 rounded-xl transition cursor-pointer space-y-1.5 group"
                >
                  <div className="flex items-center justify-between">
                    <div className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg group-hover:bg-blue-500/20">
                      <Icon size={14} />
                    </div>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      {bp.category}
                    </span>
                  </div>
                  <h4 className="font-bold text-xs text-white group-hover:text-blue-300">{bp.name}</h4>
                  <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{bp.summary}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {saveSuccessBanner && (
        <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 size={15} className="text-emerald-600" />
          <span>Database validation workflow configuration saved successfully!</span>
        </div>
      )}

      {/* 2. Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column: Workflows Catalog */}
        <div className="lg:col-span-4 space-y-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                Workflows ({workflows.length})
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Multi-Step Rules</span>
            </div>

            <div className="space-y-1.5">
              {workflows.map(wf => {
                const isSelected = wf.id === selectedWorkflowId;
                return (
                  <div
                    key={wf.id}
                    onClick={() => {
                      setSelectedWorkflowId(wf.id);
                      setIsEditing(false);
                    }}
                    className={`p-3 rounded-lg border transition cursor-pointer space-y-1 ${
                      isSelected
                        ? 'bg-blue-50/80 border-blue-300 ring-1 ring-blue-500/20 shadow-2xs'
                        : 'bg-slate-50/50 hover:bg-slate-100/80 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-xs text-slate-900 truncate">{wf.name}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        wf.category === 'Settlement' ? 'bg-purple-100 text-purple-700' :
                        wf.category === 'Fulfillment' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {wf.category}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-500 line-clamp-1">{wf.description}</p>

                    <div className="flex items-center justify-between pt-0.5 text-[10px] text-slate-400 font-mono">
                      <span>{wf.steps.length} Steps</span>
                      <span>Target: {dbList.find(d => d.id === wf.targetDbId)?.name || 'DB'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Rule Builder & Visual Pipeline */}
        <div className="lg:col-span-8 space-y-4">
          {!editingWorkflow ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs flex flex-col items-center justify-center min-h-[400px]">
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
                <Database className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-slate-800 mb-1">No Validation Workflow Selected</h3>
              <p className="text-xs text-slate-500 max-w-sm mb-6">
                There are no active validation workflows configured. Create a new workflow to start defining database verification steps and rules.
              </p>
              <button
                type="button"
                onClick={handleOpenNewWorkflowModal}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Create New Workflow
              </button>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-4">
                {/* Workflow Header Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    {isEditing ? (
                      <div className="space-y-1.5 min-w-[280px]">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editingWorkflow.name}
                        onChange={(e) => setEditingWorkflow({ ...editingWorkflow, name: e.target.value })}
                        placeholder="Workflow Name..."
                        className="font-bold text-sm text-slate-900 bg-white border border-slate-300 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs w-full max-w-sm"
                      />
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px] whitespace-nowrap">
                        {editingWorkflow.steps.length} Steps
                      </span>
                    </div>
                    <input
                      type="text"
                      value={editingWorkflow.description}
                      onChange={(e) => setEditingWorkflow({ ...editingWorkflow, description: e.target.value })}
                      placeholder="Workflow business description..."
                      className="text-xs text-slate-600 bg-white border border-slate-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
                    />
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm text-slate-900">{editingWorkflow.name}</h3>
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold text-[10px]">
                        {editingWorkflow.steps.length} Steps
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{editingWorkflow.description}</p>
                  </div>
                )}
              </div>

              {/* View Switcher & Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* View Mode Toggle */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setViewMode('editor')}
                    className={`px-2.5 py-1 rounded-md transition cursor-pointer font-semibold ${
                      viewMode === 'editor' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Editor View
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('pipeline')}
                    className={`px-2.5 py-1 rounded-md transition cursor-pointer font-semibold flex items-center gap-1 ${
                      viewMode === 'pipeline' ? 'bg-white text-blue-700 shadow-2xs font-bold' : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Workflow size={12} />
                    <span>Visual Pipeline</span>
                  </button>
                </div>

                {isEditing ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSaveCurrentWorkflow()}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition shadow-xs cursor-pointer"
                    >
                      <Save size={12} />
                      <span>Save Workflow</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsEditing(true)}
                      className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      <Edit3 size={12} />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteWorkflow(editingWorkflow.id)}
                      className="px-2 py-1 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-bold transition cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Target Scope Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase font-mono">Target Database</label>
                {isEditing ? (
                  <select
                    value={editingWorkflow.targetDbId}
                    onChange={(e) => {
                      const newDbId = e.target.value;
                      const selectedDb = dbList.find(d => d.id === newDbId);
                      const allowed = (selectedDb?.allowedTables && selectedDb.allowedTables.length > 0)
                        ? selectedDb.allowedTables
                        : (selectedDb?.availableTables || []);
                      const newTable = allowed.includes(editingWorkflow.targetTable)
                        ? editingWorkflow.targetTable
                        : (allowed[0] || editingWorkflow.targetTable);
                      setEditingWorkflow({
                        ...editingWorkflow,
                        targetDbId: newDbId,
                        targetTable: newTable
                      });
                    }}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 font-semibold text-slate-800"
                  >
                    {dbList.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.type})</option>
                    ))}
                  </select>
                ) : (
                  <div className="font-bold text-slate-900">
                    {dbList.find(d => d.id === editingWorkflow.targetDbId)?.name || 'Default DB'}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-500 uppercase font-mono">Scope Table / View</label>
                  <span className="text-[9px] text-emerald-600 font-bold uppercase font-mono">Allowed Tables Only</span>
                </div>
                {isEditing ? (
                  (() => {
                    const selectedDb = dbList.find(d => d.id === editingWorkflow.targetDbId);
                    const allowed = (selectedDb?.allowedTables && selectedDb.allowedTables.length > 0)
                      ? selectedDb.allowedTables
                      : (selectedDb?.availableTables || []);

                    if (allowed.length === 0) {
                      return (
                        <div className="space-y-1">
                          <input
                            type="text"
                            value={editingWorkflow.targetTable}
                            onChange={(e) => setEditingWorkflow({ ...editingWorkflow, targetTable: e.target.value })}
                            placeholder="e.g. cur_trax"
                            className="w-full bg-white border border-amber-300 rounded-lg p-1.5 font-mono text-slate-800 text-xs"
                          />
                          <p className="text-[9px] text-amber-600">No tables allowlisted by Admin. Manage in Admin DB Connections.</p>
                        </div>
                      );
                    }

                    return (
                      <select
                        value={editingWorkflow.targetTable}
                        onChange={(e) => setEditingWorkflow({ ...editingWorkflow, targetTable: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-lg p-1.5 font-mono text-xs text-slate-800 font-semibold focus:ring-1 focus:ring-blue-500"
                      >
                        {!allowed.includes(editingWorkflow.targetTable) && editingWorkflow.targetTable && (
                          <option value={editingWorkflow.targetTable}>{editingWorkflow.targetTable} (custom)</option>
                        )}
                        {allowed.map(tbl => (
                          <option key={tbl} value={tbl}>{tbl}</option>
                        ))}
                      </select>
                    );
                  })()
                ) : (
                  <div className="font-mono font-bold text-blue-700">{editingWorkflow.targetTable}</div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase font-mono">Category</label>
                {isEditing ? (
                  <select
                    value={editingWorkflow.category}
                    onChange={(e) => setEditingWorkflow({ ...editingWorkflow, category: e.target.value as any })}
                    className="w-full bg-white border border-slate-300 rounded-lg p-1.5 font-semibold text-slate-800"
                  >
                    <option value="Settlement">Settlement</option>
                    <option value="Fulfillment">Fulfillment</option>
                    <option value="Reconciliation">Reconciliation</option>
                    <option value="Compliance">Compliance</option>
                    <option value="Custom">Custom</option>
                  </select>
                ) : (
                  <div className="font-bold text-slate-900">{editingWorkflow.category}</div>
                )}
              </div>
            </div>

            {/* Sub-Tab Selector: Rules vs Stages */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditorSubTab('rules')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    editorSubTab === 'rules'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  <GitBranch size={13} />
                  <span>Validation Rules ({editingWorkflow.steps.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setEditorSubTab('stages')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    editorSubTab === 'stages'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  <Layers size={13} />
                  <span>Processing Stages ({(editingWorkflow.stages || []).length})</span>
                </button>
              </div>

              {editorSubTab === 'stages' && isEditing && (
                <button
                  type="button"
                  onClick={handleAddStage}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1 transition shadow-xs cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Add Processing Stage</span>
                </button>
              )}
            </div>

            {/* STAGE CONFIGURATION VIEW */}
            {editorSubTab === 'stages' ? (
              <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers size={14} className="text-blue-600" />
                      <span>Configurable Business Processing Stages</span>
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Define the external system processing stages (e.g. Ingress, Authorization, Clearing, Settlement, Ledger).
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {(editingWorkflow.stages || []).map((stage, idx) => (
                    <div key={stage.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center font-mono">
                            {stage.order || idx + 1}
                          </span>
                          {isEditing ? (
                            <input
                              type="text"
                              value={stage.name}
                              onChange={(e) => handleUpdateStage(stage.id, { name: e.target.value })}
                              placeholder="Stage Name..."
                              className="text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          ) : (
                            <span className="text-xs font-bold text-slate-900">{stage.name}</span>
                          )}
                        </div>

                        {isEditing && (editingWorkflow.stages || []).length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveStage(stage.id)}
                            className="text-xs text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 size={13} />
                            <span>Remove Stage</span>
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase font-mono">Business Meaning</label>
                          {isEditing ? (
                            <input
                              type="text"
                              value={stage.businessMeaning || ''}
                              onChange={(e) => handleUpdateStage(stage.id, { businessMeaning: e.target.value })}
                              placeholder="e.g. Authorization Ingress, Clearing..."
                              className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs text-slate-800"
                            />
                          ) : (
                            <span className="font-semibold text-slate-700">{stage.businessMeaning || 'Standard Stage'}</span>
                          )}
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase font-mono">Target Database</label>
                          {isEditing ? (
                            <select
                              value={stage.targetDbId || dbList[0]?.id || ''}
                              onChange={(e) => {
                                const newDbId = e.target.value;
                                const sDb = dbList.find(d => d.id === newDbId);
                                const tbls = (sDb?.allowedTables && sDb.allowedTables.length > 0)
                                  ? sDb.allowedTables
                                  : (sDb?.availableTables || []);
                                const newDs = tbls.includes(stage.targetDataSource || '')
                                  ? stage.targetDataSource
                                  : (tbls[0] || stage.targetDataSource);
                                handleUpdateStage(stage.id, { targetDbId: newDbId, targetDataSource: newDs });
                              }}
                              className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs text-slate-800 font-semibold"
                            >
                              {dbList.map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="font-mono text-slate-700">
                              {dbList.find(d => d.id === stage.targetDbId)?.name || 'Default DB'}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-slate-500 uppercase font-mono">Configured Data Source / Table</label>
                            <span className="text-[9px] text-emerald-600 font-bold uppercase font-mono">Allowed</span>
                          </div>
                          {isEditing ? (
                            (() => {
                              const stageDbId = stage.targetDbId || dbList[0]?.id;
                              const stageDb = dbList.find(d => d.id === stageDbId);
                              const tbls = (stageDb?.allowedTables && stageDb.allowedTables.length > 0)
                                ? stageDb.allowedTables
                                : (stageDb?.availableTables || []);

                              if (tbls.length === 0) {
                                return (
                                  <input
                                    type="text"
                                    value={stage.targetDataSource || ''}
                                    onChange={(e) => handleUpdateStage(stage.id, { targetDataSource: e.target.value })}
                                    placeholder="e.g. cur_trax"
                                    className="w-full bg-white border border-amber-300 rounded p-1.5 text-xs text-slate-800 font-mono"
                                  />
                                );
                              }

                              return (
                                <select
                                  value={stage.targetDataSource || tbls[0]}
                                  onChange={(e) => handleUpdateStage(stage.id, { targetDataSource: e.target.value })}
                                  className="w-full bg-white border border-slate-300 rounded p-1.5 text-xs text-slate-800 font-mono font-semibold"
                                >
                                  {stage.targetDataSource && !tbls.includes(stage.targetDataSource) && (
                                    <option value={stage.targetDataSource}>{stage.targetDataSource} (custom)</option>
                                  )}
                                  {tbls.map(t => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                              );
                            })()
                          ) : (
                            <span className="font-mono font-bold text-blue-700">{stage.targetDataSource || 'default'}</span>
                          )}
                        </div>
                      </div>

                      <div className="pt-1">
                        <span className="text-[10px] text-slate-400 font-mono">
                          Rules bound to this stage: {editingWorkflow.steps.filter(s => s.stageId === stage.id).length} rule(s)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : viewMode === 'pipeline' ? (
              /* VISUAL PIPELINE VIEW */
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-4 text-white">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Workflow size={14} className="text-blue-400" />

                    <span>Visual Rule Execution Trajectory</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">Sequential Logic Map</span>
                </div>

                <div className="space-y-4 pt-2">
                  {editingWorkflow.steps.map((step, sIdx) => {
                    const isLast = sIdx === editingWorkflow.steps.length - 1;
                    return (
                      <div key={step.id} className="relative space-y-2">
                        {/* Step Card */}
                        <div
                          onClick={() => {
                            setActiveStepIndex(sIdx);
                            setViewMode('editor');
                          }}
                          className={`p-3.5 rounded-xl border transition cursor-pointer ${
                            activeStepIndex === sIdx
                              ? 'bg-slate-800 border-blue-400 ring-1 ring-blue-500/30'
                              : 'bg-slate-950 hover:bg-slate-800/80 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center font-mono">
                                {step.stepNumber}
                              </span>
                              <span className="font-bold text-xs text-slate-100">{step.name}</span>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-blue-300 border border-slate-700">
                                {step.checkType}
                              </span>
                            </div>

                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                              step.severityOnFailure === 'CRITICAL' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                              step.severityOnFailure === 'WARNING' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                            }`}>
                              On Fail: {step.severityOnFailure}
                            </span>
                          </div>

                          {/* Human Readable Summary */}
                          <p className="text-[11px] text-slate-400 font-mono mt-2 bg-slate-900 p-2 rounded-lg border border-slate-800/80">
                            🔍 <span className="text-slate-300">WHEN</span> [{step.requiredParams.join(', ')}] ➔ <span className="text-slate-300">VERIFY</span> {step.checkType === 'EXISTENCE_CHECK' ? 'Exists in DB' : step.checkType === 'FIELD_COMPARATOR' ? `${step.sourceField} ${step.comparator} '${step.compareValue}'` : step.checkType === 'ISO_DECLINE_CODE' ? 'Response Code 00' : 'Condition'}
                          </p>

                          {/* Branch Outcomes */}
                          <div className="flex items-center gap-3 pt-2 text-[10px] font-mono">
                            <span className="text-emerald-400 flex items-center gap-1">
                              <span>✅ Pass:</span>
                              <span className="text-slate-300">{step.successMessage || 'Proceed to next'}</span>
                            </span>
                            <span className="text-slate-600">•</span>
                            <span className="text-rose-400 flex items-center gap-1">
                              <span>❌ Fail:</span>
                              <span className="text-slate-300">{step.failureMessage || 'Trigger failure'}</span>
                            </span>
                          </div>
                        </div>

                        {/* Connector Arrow */}
                        {!isLast && (
                          <div className="flex items-center justify-center py-1 text-slate-500">
                            <ArrowDownRight size={14} className="text-blue-400 animate-pulse" />
                            <span className="text-[10px] text-slate-400 font-mono ml-1">
                              {editingWorkflow.steps[sIdx + 1].dependencyCondition === 'IF_PREV_FAILURE'
                                ? 'Fallback Branch (If Failed)'
                                : 'Next Step (If Passed)'}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* EDITOR VIEW */
              <div className="space-y-4">
                {/* Step Selector Ribbon */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <GitBranch className="w-3.5 h-3.5 text-blue-600" />
                    <span>Sequential Steps ({editingWorkflow.steps.length})</span>
                  </span>

                  {isEditing && (
                    <button
                      type="button"
                      onClick={handleOpenNewRuleModal}
                      className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                      title="Name and add a new validation rule"
                    >
                      <Plus size={13} />
                      <span>Add Rule</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {editingWorkflow.steps.map((step, idx) => {
                    const isSelected = activeStepIndex === idx;
                    return (
                      <React.Fragment key={step.id}>
                        {idx > 0 && (
                          <div className="text-slate-300 flex-shrink-0">
                            <ArrowRight size={14} />
                          </div>
                        )}
                        <div
                          onClick={() => setActiveStepIndex(idx)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer flex-shrink-0 ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-1.5">
                            <span className={`w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center ${
                              isSelected ? 'bg-white text-blue-700' : 'bg-slate-200 text-slate-700'
                            }`}>
                              {idx + 1}
                            </span>
                            <span className="font-bold truncate max-w-[140px]">{step.name}</span>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* 3-BLOCK SIMPLIFIED RULE BUILDER */}
                {activeStep && (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                    {/* Top Step Header */}
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center font-mono">
                          {activeStep.stepNumber}
                        </span>
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-bold text-slate-500 font-mono">Rule Name:</span>
                            <input
                              type="text"
                              value={activeStep.name}
                              onChange={(e) => handleUpdateActiveStep({ name: e.target.value })}
                              placeholder="e.g. Card Authorization Check"
                              className="text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 min-w-[260px] shadow-2xs"
                            />
                          </div>
                        ) : (
                          <h4 className="font-bold text-xs text-slate-900">
                            Step {activeStep.stepNumber}: {activeStep.name}
                          </h4>
                        )}
                      </div>

                      {isEditing && editingWorkflow.steps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveStep(activeStepIndex)}
                          className="text-xs text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 size={13} />
                          <span>Delete Step</span>
                        </button>
                      )}
                    </div>

                    {/* NATURAL LANGUAGE SENTENCE BANNER */}
                    <div className="p-2.5 bg-blue-950 text-blue-100 rounded-lg font-mono text-[11px] border border-blue-900 flex flex-wrap items-center gap-2">
                      <span className="text-blue-400 font-bold uppercase tracking-wider">Rule Sentence:</span>
                      <span>WHEN <strong className="text-white">[{naturalLanguageRuleSentence.params}]</strong></span>
                      <span>➔</span>
                      <span>LOOKUP in <strong className="text-white">[{naturalLanguageRuleSentence.target}]</strong></span>
                      <span>➔</span>
                      <span>VERIFY <strong className="text-emerald-300">[{naturalLanguageRuleSentence.criteria}]</strong></span>
                      <span>➔</span>
                      <span>ON FAIL <strong className="text-rose-300">[{activeStep.severityOnFailure || 'WARNING'}]</strong></span>
                    </div>

                    {/* BLOCK 1: SCOPE & MANDATORY PARAMETERS */}
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <KeyRound size={13} className="text-blue-600" />
                          <span>Block 1: Lookup Target & Mandatory Input Keys</span>
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                            <Layers size={10} className="text-indigo-600" />
                            <span>Global Mapping Schema (v{globalMappingVersion})</span>
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">Input Parameters</span>
                        </div>
                      </div>

                      {/* Rule Name Field (User Assigned Name) */}
                      <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            <Tag size={13} className="text-blue-600" />
                            <span>Rule Name / Title (User-Assigned):</span>
                          </label>
                          {isEditing && (
                            <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider font-mono">
                              Custom Rule Name
                            </span>
                          )}
                        </div>
                        {isEditing ? (
                          <input
                            type="text"
                            value={activeStep.name}
                            onChange={(e) => handleUpdateActiveStep({ name: e.target.value })}
                            placeholder="e.g. Settlement Amount Reconciliation Check"
                            className="w-full text-xs font-bold text-slate-900 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                          />
                        ) : (
                          <div className="text-xs font-bold text-slate-900 bg-white border border-slate-200 rounded-lg px-3 py-2">
                            {activeStep.name}
                          </div>
                        )}
                        <p className="text-[10px] text-slate-500 italic">
                          Give this rule a descriptive business name to identify it across execution audit logs, dashboards, and test suites.
                        </p>
                      </div>

                      {/* Assigned Processing Stage */}
                      <div className="p-2.5 bg-indigo-50/60 rounded-lg border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Layers size={13} className="text-indigo-600" />
                          <span className="text-xs font-bold text-slate-800">Processing Stage:</span>
                        </div>
                        {isEditing ? (
                          <select
                            value={activeStep.stageId || editingWorkflow.stages?.[0]?.id || ''}
                            onChange={(e) => handleUpdateActiveStep({ stageId: e.target.value })}
                            className="bg-white border border-indigo-200 rounded px-2.5 py-1 text-xs font-bold text-indigo-950 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            {(editingWorkflow.stages || []).map((st) => (
                              <option key={st.id} value={st.id}>
                                {st.name} ({st.targetDataSource || 'source'})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="px-2.5 py-1 rounded text-xs font-bold bg-indigo-100 text-indigo-900 border border-indigo-200">
                            {editingWorkflow.stages?.find(s => s.id === activeStep.stageId)?.name || 'Default Stage'}
                          </span>
                        )}
                      </div>

                      <div className="space-y-2">
                        {isEditing ? (

                          <div className="space-y-2.5">
                            {/* Active Chips */}
                            <div className="flex flex-wrap items-center gap-1.5 min-h-[34px] p-2 bg-slate-50 border border-slate-200 rounded-lg">
                              {(activeStep.requiredParams || []).length === 0 ? (
                                <span className="text-[11px] text-slate-400 italic">No parameters required. Select from Global Mapping Schema below or add a custom key.</span>
                              ) : (
                                activeStep.requiredParams.map(param => {
                                  const schemaField = globalSchemaFields.find(f => f.key === param);
                                  return (
                                    <span
                                      key={param}
                                      className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-indigo-50 text-indigo-900 border border-indigo-200 rounded text-xs font-mono font-bold shadow-2xs"
                                    >
                                      <span>{param}</span>
                                      {schemaField && (
                                        <span className="text-[9px] font-normal text-indigo-500 font-sans">
                                          ({schemaField.dataType})
                                        </span>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleUpdateActiveStep({
                                            requiredParams: activeStep.requiredParams.filter(p => p !== param)
                                          });
                                        }}
                                        className="text-indigo-400 hover:text-rose-600 p-0.5 rounded cursor-pointer transition"
                                        title={`Remove ${param}`}
                                      >
                                        <X size={11} />
                                      </button>
                                    </span>
                                  );
                                })
                              )}
                            </div>

                            {/* Dropdown Selector & Custom Input */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {/* 1. Global Mapping Schema Dropdown Picker */}
                              <div className="relative">
                                <select
                                  value=""
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val && !activeStep.requiredParams.includes(val)) {
                                      handleUpdateActiveStep({
                                        requiredParams: [...activeStep.requiredParams, val]
                                      });
                                      const fieldObj = globalSchemaFields.find(f => f.key === val);
                                      if (fieldObj?.exampleValue && !testInputs[val]) {
                                        setTestInputs(prev => ({ ...prev, [val]: fieldObj.exampleValue || '' }));
                                      }
                                    }
                                  }}
                                  className="w-full bg-indigo-50/70 hover:bg-indigo-50 border border-indigo-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-indigo-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                                >
                                  <option value="">➕ Select from Global Mapping Schema...</option>
                                  {globalSchemaFields.map(f => {
                                    const isSelected = activeStep.requiredParams?.includes(f.key);
                                    return (
                                      <option key={f.key} value={f.key} disabled={isSelected}>
                                        {f.key} — {f.label} ({f.dataType}){f.required ? ' *' : ''}{isSelected ? ' (Added)' : ''}
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>

                              {/* 2. Custom Input & Add Button */}
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={newRequiredParamInput}
                                  onChange={(e) => setNewRequiredParamInput(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      const trimmed = newRequiredParamInput.trim();
                                      if (trimmed && !activeStep.requiredParams.includes(trimmed)) {
                                        handleUpdateActiveStep({
                                          requiredParams: [...activeStep.requiredParams, trimmed]
                                        });
                                        setNewRequiredParamInput('');
                                      }
                                    }
                                  }}
                                  placeholder="Or type custom key (e.g. date_range)..."
                                  className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const trimmed = newRequiredParamInput.trim();
                                    if (trimmed && !activeStep.requiredParams.includes(trimmed)) {
                                      handleUpdateActiveStep({
                                        requiredParams: [...activeStep.requiredParams, trimmed]
                                      });
                                      setNewRequiredParamInput('');
                                    }
                                  }}
                                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                >
                                  <Plus size={12} />
                                  <span>Add</span>
                                </button>
                              </div>
                            </div>

                            {/* Global Mapping Schema Parameter Presets (Click-to-Add) */}
                            <div className="space-y-1.5 pt-1 border-t border-slate-100">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-600 flex items-center gap-1">
                                  <Sparkles size={11} className="text-indigo-600" />
                                  <span>Global Mapping Schema Parameters:</span>
                                </span>
                                <button
                                  type="button"
                                  onClick={refreshGlobalSchema}
                                  className="text-[10px] text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer font-medium"
                                  title="Sync fields from Global Mapping Schema"
                                >
                                  <RefreshCw size={10} />
                                  <span>Sync Schema</span>
                                </button>
                              </div>

                              <div className="flex flex-wrap items-center gap-1 max-h-[120px] overflow-y-auto p-1.5 bg-slate-50/80 border border-slate-200 rounded-lg">
                                {globalSchemaFields.map(f => {
                                  const isAdded = activeStep.requiredParams?.includes(f.key);
                                  return (
                                    <button
                                      key={f.key}
                                      type="button"
                                      onClick={() => {
                                        if (!isAdded) {
                                          handleUpdateActiveStep({
                                            requiredParams: [...(activeStep.requiredParams || []), f.key]
                                          });
                                          if (f.exampleValue && !testInputs[f.key]) {
                                            setTestInputs(prev => ({ ...prev, [f.key]: f.exampleValue || '' }));
                                          }
                                        }
                                      }}
                                      disabled={isAdded}
                                      title={`${f.label} (${f.dataType})${f.description ? ' • ' + f.description : ''}${f.required ? ' [Core Required]' : ''}`}
                                      className={`px-2 py-0.5 rounded text-[11px] font-mono transition flex items-center gap-1 border cursor-pointer ${
                                        isAdded
                                          ? 'bg-slate-200/80 text-slate-400 border-slate-300 opacity-60 cursor-default'
                                          : 'bg-white hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border-slate-200 hover:border-indigo-300 shadow-2xs'
                                      }`}
                                    >
                                      <span>{isAdded ? '✓' : '+'}{f.key}</span>
                                      <span className="text-[9px] text-slate-400 font-sans">({f.dataType})</span>
                                      {f.required && <span className="text-rose-500 font-bold text-[9px]">*</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {(activeStep.requiredParams || []).map(p => {
                              const schemaField = globalSchemaFields.find(f => f.key === p);
                              return (
                                <span key={p} className="px-2 py-0.5 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded font-mono text-xs font-bold flex items-center gap-1">
                                  <span>{p}</span>
                                  {schemaField && (
                                    <span className="text-[10px] text-indigo-400 font-normal font-sans">({schemaField.dataType})</span>
                                  )}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* BLOCK 2: VERIFICATION CRITERIA */}
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <CheckSquare size={13} className="text-purple-600" />
                          <span>Block 2: Verification Condition & Criteria</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">Validation Rule</span>
                      </div>

                      {/* Check Type Selector */}
                      <div className="space-y-2">
                        {isEditing ? (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[
                              { id: 'EXISTENCE_CHECK', label: 'Record Exists in DB', icon: Database },
                              { id: 'FIELD_COMPARATOR', label: 'Field Matches Value', icon: CheckSquare },
                              { id: 'ISO_DECLINE_CODE', label: 'Bank ISO Decline Code', icon: CreditCard },
                              { id: 'SQL_CONDITION', label: 'Custom SQL / SLA Window', icon: Code2 }
                            ].map(ct => {
                              const isSelected = activeStep.checkType === ct.id;
                              const Icon = ct.icon;
                              return (
                                <button
                                  key={ct.id}
                                  type="button"
                                  onClick={() => handleUpdateActiveStep({ checkType: ct.id as any })}
                                  className={`p-2 rounded-lg border text-left text-xs transition cursor-pointer flex flex-col gap-1 ${
                                    isSelected
                                      ? 'bg-blue-50 border-blue-400 text-blue-900 font-bold ring-1 ring-blue-400/20'
                                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                                  }`}
                                >
                                  <Icon size={14} className={isSelected ? 'text-blue-600' : 'text-slate-400'} />
                                  <span>{ct.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-xs font-bold text-slate-800 font-mono">{activeStep.checkType}</div>
                        )}

                        {/* Criteria Specific Inputs */}
                        {activeStep.checkType === 'FIELD_COMPARATOR' && (
                          <div className="grid grid-cols-3 gap-2 pt-1">
                            <div>
                              <span className="text-[10px] text-slate-500 font-bold block mb-1">Target Field</span>
                              {isEditing ? (
                                <>
                                  <input
                                    type="text"
                                    list="global-mapping-schema-fields-list"
                                    value={activeStep.sourceField || ''}
                                    onChange={(e) => handleUpdateActiveStep({ sourceField: e.target.value })}
                                    placeholder="e.g. status_state, amount_usd..."
                                    className="w-full bg-slate-50 border border-slate-300 rounded p-1.5 font-mono text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                  <datalist id="global-mapping-schema-fields-list">
                                    {globalSchemaFields.map(f => (
                                      <option key={f.key} value={f.key}>
                                        {f.label} ({f.dataType})
                                      </option>
                                    ))}
                                  </datalist>
                                </>
                              ) : (
                                <span className="font-mono text-xs text-slate-800">{activeStep.sourceField}</span>
                              )}
                            </div>

                            <div>
                              <span className="text-[10px] text-slate-500 font-bold block mb-1">Operator</span>
                              {isEditing ? (
                                <select
                                  value={activeStep.comparator || '='}
                                  onChange={(e) => handleUpdateActiveStep({ comparator: e.target.value as any })}
                                  className="w-full bg-slate-50 border border-slate-300 rounded p-1.5 font-mono text-xs text-slate-800"
                                >
                                  <option value="=">= (Equals)</option>
                                  <option value="CONTAINS">CONTAINS (Substring match)</option>
                                  <option value="NOT_CONTAINS">NOT CONTAINS</option>
                                  <option value="LIKE">LIKE (%pattern%)</option>
                                  <option value="IN">IN (List of values)</option>
                                  <option value="!=">!= (Not Equals)</option>
                                  <option value=">">&gt; (Greater)</option>
                                  <option value="<">&lt; (Less)</option>
                                  <option value=">=">&gt;= (Greater/Equal)</option>
                                  <option value="<=">&lt;= (Less/Equal)</option>
                                </select>
                              ) : (
                                <span className="font-mono text-xs text-slate-800">{activeStep.comparator}</span>
                              )}
                            </div>

                            <div>
                              <span className="text-[10px] text-slate-500 font-bold block mb-1">Expected Value</span>
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={activeStep.compareValue || ''}
                                  onChange={(e) => handleUpdateActiveStep({ compareValue: e.target.value })}
                                  placeholder="e.g. SETTLED"
                                  className="w-full bg-slate-50 border border-slate-300 rounded p-1.5 font-mono text-xs text-slate-800"
                                />
                              ) : (
                                <span className="font-mono text-xs text-slate-800">{activeStep.compareValue}</span>
                              )}
                            </div>
                          </div>
                        )}

                        {activeStep.checkType === 'SQL_CONDITION' && (
                          <div className="pt-1">
                            <span className="text-[10px] text-slate-500 font-bold block mb-1">SQL Expression / Predicate</span>
                            {isEditing ? (
                              <input
                                type="text"
                                value={activeStep.sqlCondition || ''}
                                onChange={(e) => handleUpdateActiveStep({ sqlCondition: e.target.value })}
                                placeholder="e.g. TIMESTAMPDIFF(HOUR, created_at, shipped_at) <= 24"
                                className="w-full bg-slate-50 border border-slate-300 rounded p-1.5 font-mono text-xs text-slate-800"
                              />
                            ) : (
                              <span className="font-mono text-xs text-slate-800">{activeStep.sqlCondition}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* BLOCK 3: EXECUTION LOGIC & OUTCOME MESSAGES */}
                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                          <Sliders size={13} className="text-emerald-600" />
                          <span>Block 3: Execution Trigger & Outcome Diagnostics</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">Trigger & Severity</span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        {/* Execution Trigger */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-600 block">When to Execute Step</label>
                          {isEditing ? (
                            <select
                              value={activeStep.dependencyCondition}
                              onChange={(e) => handleUpdateActiveStep({ dependencyCondition: e.target.value as any })}
                              className="w-full bg-slate-50 border border-slate-300 rounded p-1.5 text-xs text-slate-800 font-semibold"
                            >
                              <option value="ALWAYS">Always Run (Unconditional)</option>
                              <option value="IF_PREV_SUCCESS">Execute only if Previous Step Passed</option>
                              <option value="IF_PREV_FAILURE">Execute only if Previous Step Failed (Fallback / Audit)</option>
                            </select>
                          ) : (
                            <div className="font-semibold text-purple-700">{activeStep.dependencyCondition}</div>
                          )}
                        </div>

                        {/* Severity on Failure */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-600 block">Failure Severity Alert</label>
                          {isEditing ? (
                            <select
                              value={activeStep.severityOnFailure || 'WARNING'}
                              onChange={(e) => handleUpdateActiveStep({ severityOnFailure: e.target.value as any })}
                              className="w-full bg-slate-50 border border-slate-300 rounded p-1.5 text-xs text-slate-800 font-bold"
                            >
                              <option value="CRITICAL">🔴 Critical (Blocks Workflow)</option>
                              <option value="WARNING">🟡 Warning (Needs Attention)</option>
                              <option value="INFO">🔵 Info (Informational Log)</option>
                            </select>
                          ) : (
                            <div className="font-bold text-slate-800">{activeStep.severityOnFailure}</div>
                          )}
                        </div>

                        {/* Custom Success Message */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-emerald-700 block">Success Outcome Message</label>
                          {isEditing ? (
                            <input
                              type="text"
                              value={activeStep.successMessage || ''}
                              onChange={(e) => handleUpdateActiveStep({ successMessage: e.target.value })}
                              className="w-full bg-slate-50 border border-slate-300 rounded p-1.5 text-xs text-slate-800"
                            />
                          ) : (
                            <p className="text-emerald-800 bg-emerald-50 p-1.5 rounded border border-emerald-200">
                              {activeStep.successMessage || 'Step passed.'}
                            </p>
                          )}
                        </div>

                        {/* Custom Failure Message */}
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-rose-700 block">Failure Diagnostic Message</label>
                          {isEditing ? (
                            <input
                              type="text"
                              value={activeStep.failureMessage || ''}
                              onChange={(e) => handleUpdateActiveStep({ failureMessage: e.target.value })}
                              className="w-full bg-slate-50 border border-slate-300 rounded p-1.5 text-xs text-slate-800"
                            />
                          ) : (
                            <p className="text-rose-800 bg-rose-50 p-1.5 rounded border border-rose-200">
                              {activeStep.failureMessage || 'Step failed criteria.'}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Decoupled Pipeline Actions (Result ≠ Flow Control) */}
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 mt-2">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                          <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                            <Sliders size={13} className="text-blue-600" />
                            <span>Pipeline Actions (Result ≠ Flow Control)</span>
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">CONTINUE • STOP • CLOSE</span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          Configure what the pipeline does next when this rule produces a PASS, FAIL, or ERROR. Business failure does not automatically halt the pipeline.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                          {/* On PASS */}
                          <div className="p-2.5 bg-emerald-50/80 rounded-lg border border-emerald-200 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-emerald-900">On PASS Result</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-emerald-200 text-emerald-900">PASS</span>
                            </div>
                            {isEditing ? (
                              <select
                                value={activeStep.onPassAction || 'CONTINUE'}
                                onChange={(e) => handleUpdateActiveStep({ onPassAction: e.target.value as any })}
                                className="w-full bg-white border border-emerald-300 rounded p-1 text-xs text-emerald-950 font-bold"
                              >
                                <option value="CONTINUE">CONTINUE (Evaluate Next Rule/Stage)</option>
                                <option value="CLOSE">CLOSE (Terminate & Mark Closed)</option>
                              </select>
                            ) : (
                              <div className="font-bold text-xs text-emerald-900">{activeStep.onPassAction || 'CONTINUE'}</div>
                            )}
                            <p className="text-[9px] text-emerald-700">Action taken when condition succeeds</p>
                          </div>

                          {/* On FAIL */}
                          <div className="p-2.5 bg-amber-50/80 rounded-lg border border-amber-200 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-amber-900">On FAIL Result</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-amber-200 text-amber-900">FAIL</span>
                            </div>
                            {isEditing ? (
                              <select
                                value={activeStep.onFailAction || 'STOP'}
                                onChange={(e) => handleUpdateActiveStep({ onFailAction: e.target.value as any })}
                                className="w-full bg-white border border-amber-300 rounded p-1 text-xs text-amber-950 font-bold"
                              >
                                <option value="CONTINUE">CONTINUE (Inspect Next Rule/Stage)</option>
                                <option value="STOP">STOP (Halt Pipeline for Record)</option>
                                <option value="CLOSE">CLOSE (Conclude Investigation)</option>
                              </select>
                            ) : (
                              <div className="font-bold text-xs text-amber-900">{activeStep.onFailAction || 'STOP'}</div>
                            )}
                            <p className="text-[9px] text-amber-700">Action taken on criteria mismatch</p>
                          </div>

                          {/* On ERROR */}
                          <div className="p-2.5 bg-rose-50/80 rounded-lg border border-rose-200 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-bold text-rose-900">On ERROR Result</span>
                              <span className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-rose-200 text-rose-900">ERROR</span>
                            </div>
                            {isEditing ? (
                              <select
                                value={activeStep.onErrorAction || 'STOP'}
                                onChange={(e) => handleUpdateActiveStep({ onErrorAction: e.target.value as any })}
                                className="w-full bg-white border border-rose-300 rounded p-1 text-xs text-rose-950 font-bold"
                              >
                                <option value="STOP">STOP (Halt on Exception)</option>
                                <option value="CONTINUE">CONTINUE (Log Fault & Proceed)</option>
                              </select>
                            ) : (
                              <div className="font-bold text-xs text-rose-900">{activeStep.onErrorAction || 'STOP'}</div>
                            )}
                            <p className="text-[9px] text-rose-700">Action taken on DB or technical failure</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Live Interactive Test Engine */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-blue-100 text-blue-700 rounded-lg">
                  <Terminal size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                    Investigation & Rule Simulation Engine
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Evaluates multi-stage pipeline rules, enforces Result ≠ Action decoupling, and computes transaction investigation lifecycle state.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunSimulation}
                  disabled={isRunningTest}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                >
                  <Play className={`w-3.5 h-3.5 ${isRunningTest ? 'animate-spin' : 'fill-white'}`} />
                  <span>{isRunningTest ? 'Evaluating...' : 'Run Investigation Test'}</span>
                </button>
              </div>
            </div>

            {/* Quick 1-Click Scenario Preset Buttons */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block font-mono">
                1-Click Preset Scenario Verification (Test Result vs Action Decoupling)
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <button
                  type="button"
                  onClick={() => handleRunPresetScenario('PASS_CONTINUE')}
                  className="px-2 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-[11px] font-bold rounded-lg transition text-left cursor-pointer"
                >
                  <div>✅ PASS + CONTINUE</div>
                  <div className="text-[9px] font-normal text-emerald-700">Advances to next rule</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleRunPresetScenario('PASS_CLOSE')}
                  className="px-2 py-1.5 bg-teal-50 hover:bg-teal-100 border border-teal-300 text-teal-900 text-[11px] font-bold rounded-lg transition text-left cursor-pointer"
                >
                  <div>🎯 PASS + CLOSE</div>
                  <div className="text-[9px] font-normal text-teal-700">Concludes investigation</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleRunPresetScenario('FAIL_CONTINUE')}
                  className="px-2 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 text-[11px] font-bold rounded-lg transition text-left cursor-pointer"
                >
                  <div>⚠️ FAIL + CONTINUE</div>
                  <div className="text-[9px] font-normal text-amber-700">Continues downstream</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleRunPresetScenario('FAIL_CLOSE')}
                  className="px-2 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-300 text-indigo-900 text-[11px] font-bold rounded-lg transition text-left cursor-pointer"
                >
                  <div>🔒 FAIL + CLOSE</div>
                  <div className="text-[9px] font-normal text-indigo-700">Terminates on fail</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleRunPresetScenario('FAIL_STOP')}
                  className="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-900 text-[11px] font-bold rounded-lg transition text-left cursor-pointer"
                >
                  <div>🛑 FAIL + STOP</div>
                  <div className="text-[9px] font-normal text-rose-700">Halts pipeline</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleRunPresetScenario('ERROR_STOP')}
                  className="px-2 py-1.5 bg-purple-50 hover:bg-purple-100 border border-purple-300 text-purple-900 text-[11px] font-bold rounded-lg transition text-left cursor-pointer"
                >
                  <div>⚡ ERROR + STOP</div>
                  <div className="text-[9px] font-normal text-purple-700">Technical fault halts</div>
                </button>
              </div>
            </div>

            {/* Test Inputs */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-700">Dynamic Parameter Test Values:</span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {allWorkflowParams.length} parameters configured across steps
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                {allWorkflowParams.map(param => {
                  const isMandatory = activeWorkflowRequiredParams instanceof Set
                    ? activeWorkflowRequiredParams.has(param)
                    : Array.isArray(activeWorkflowRequiredParams)
                    ? (activeWorkflowRequiredParams as string[]).includes(param)
                    : false;
                  return (
                    <div key={param} className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-600 font-mono flex items-center justify-between">
                        <span className="truncate">{param}</span>
                        {isMandatory && (
                          <span className="text-rose-500 font-bold text-[9px] bg-rose-50 px-1 rounded border border-rose-200">
                            Required *
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        value={testInputs[param] || ''}
                        onChange={(e) => setTestInputs({ ...testInputs, [param]: e.target.value })}
                        placeholder={`Enter ${param}...`}
                        className={`w-full border rounded-lg p-1.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                          isMandatory && (!testInputs[param] || testInputs[param].trim() === '')
                            ? 'bg-rose-50/40 border-rose-300 text-rose-900'
                            : 'bg-slate-50 border-slate-200 text-slate-800'
                        }`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Structured Simulation Execution Summary */}
            {testExecutionSummary && (
              <div className="space-y-3 pt-3 border-t border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-900 text-white rounded-xl">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Investigation Lifecycle Status:
                    </span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider font-mono ${
                      testExecutionSummary.investigationStatus === 'RECONCILED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                      testExecutionSummary.investigationStatus === 'CLOSED' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40' :
                      testExecutionSummary.investigationStatus === 'FLAGGED' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                      'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}>
                      {testExecutionSummary.investigationStatus}
                    </span>
                    {testExecutionSummary.statusFlagText && (
                      <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-white/15 text-white border border-white/25">
                        🚩 {testExecutionSummary.statusFlagText}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-xs font-mono">
                    <span className="text-slate-300">
                      Total Duration: <strong>{testExecutionSummary.totalDurationMs}ms</strong>
                    </span>
                    <span className="text-slate-500">|</span>
                    <span className={testExecutionSummary.isHalted ? 'text-amber-400 font-bold' : 'text-slate-300'}>
                      Pipeline Halted: {testExecutionSummary.isHalted ? `Yes (${testExecutionSummary.haltReason})` : 'No'}
                    </span>
                    <span className="text-slate-500">|</span>
                    <span className={testExecutionSummary.isClosed ? 'text-emerald-400 font-bold' : 'text-slate-300'}>
                      Case Closed: {testExecutionSummary.isClosed ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>

                {/* Audit Trail List */}
                <div className="space-y-2">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle size={13} className="text-blue-600" />
                    <span>Stage & Rule Execution Audit Trail</span>
                  </span>

                  <div className="space-y-1.5">
                    {testExecutionSummary.auditTrail.map((entry, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                          entry.validationResult === 'PASS' ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' :
                          entry.validationResult === 'FAIL' ? 'bg-amber-50/70 border-amber-200 text-amber-950' :
                          'bg-rose-50/70 border-rose-200 text-rose-950'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-slate-700 border border-slate-300 shadow-2xs font-mono">
                              {entry.stageName}
                            </span>
                            <span className="font-bold text-slate-900">
                              Step {entry.stepNumber}: {entry.ruleName}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              ({entry.checkType})
                            </span>
                          </div>

                          <div className="flex items-center gap-2 font-mono text-[10px]">
                            {/* Validation Result Badge */}
                            <span className={`px-2 py-0.5 rounded font-bold ${
                              entry.validationResult === 'PASS' ? 'bg-emerald-600 text-white' :
                              entry.validationResult === 'FAIL' ? 'bg-amber-500 text-white' :
                              'bg-rose-600 text-white'
                            }`}>
                              RESULT: {entry.validationResult}
                            </span>

                            {/* Pipeline Action Badge */}
                            <span className={`px-2 py-0.5 rounded font-bold border ${
                              entry.pipelineAction === 'CONTINUE' ? 'bg-blue-50 text-blue-800 border-blue-200' :
                              entry.pipelineAction === 'STOP' ? 'bg-rose-50 text-rose-800 border-rose-200' :
                              'bg-purple-50 text-purple-800 border-purple-200'
                            }`}>
                              ACTION: {entry.pipelineAction}
                            </span>

                            <span className="text-slate-500 font-bold">{entry.durationMs}ms</span>
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-700 font-sans">
                          {entry.message}
                        </p>

                        {entry.errorDetail && (
                          <div className="p-2 bg-rose-100 rounded text-[10px] font-mono text-rose-900 border border-rose-300">
                            Technical Exception: {entry.errorDetail}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Remedy SQL if present */}
                {testExecutionSummary.remedySql && (
                  <div className="p-3 bg-slate-950 text-emerald-300 rounded-xl font-mono text-xs border border-slate-800 space-y-1">
                    <span className="text-slate-400 uppercase font-bold text-[10px]">Suggested Remedy / Correction SQL:</span>
                    <pre className="whitespace-pre-wrap">{testExecutionSummary.remedySql}</pre>
                  </div>
                )}
              </div>
            )}
          </div>
            </>
          )}
        </div>
      </div>
      {/* Create New Rule Modal (User Gives Name) */}
      {showNewRuleModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  <Plus size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Name Your New Rule</h3>
                  <p className="text-[11px] text-slate-500">Provide a descriptive business name for this validation check</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNewRuleModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleConfirmCreateRule} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <span>Rule Name</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  placeholder="e.g. Verify Settlement Ledger Amount"
                  className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                  required
                />
                <p className="text-[10px] text-slate-500">
                  This name will identify the rule in verification grids, reports, and logs.
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800">Rule Description (Optional)</label>
                <textarea
                  value={newRuleDescription}
                  onChange={(e) => setNewRuleDescription(e.target.value)}
                  placeholder="Explain the purpose or business rationale of this rule..."
                  rows={2}
                  className="w-full text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800">Processing Stage</label>
                  <select
                    value={newRuleStageId}
                    onChange={(e) => setNewRuleStageId(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                  >
                    {(editingWorkflow.stages || []).map(st => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800">Check Type</label>
                  <select
                    value={newRuleCheckType}
                    onChange={(e) => setNewRuleCheckType(e.target.value as any)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                  >
                    <option value="EXISTENCE_CHECK">Existence Check</option>
                    <option value="FIELD_COMPARATOR">Field Comparator</option>
                    <option value="AMOUNT_MATCH">Amount Match</option>
                    <option value="STATUS_MATCH">Status Match</option>
                    <option value="ISO_DECLINE_CODE">ISO Decline Code</option>
                    <option value="NUMERIC_THRESHOLD">Numeric Threshold</option>
                    <option value="REGEX_MATCH">Regex Match</option>
                    <option value="SQL_CONDITION">SQL Condition</option>
                    <option value="CROSS_DB_LOOKUP">Cross-DB Lookup</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewRuleModal(false)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                >
                  Create Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Create New Workflow Modal (User Gives Name First) */}
      {showNewWorkflowModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                  <ShieldCheck size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Name Your Validation Workflow</h3>
                  <p className="text-[11px] text-slate-500">Provide a name first before configuring rules and stages</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNewWorkflowModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleConfirmCreateWorkflow} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800 flex items-center gap-1">
                  <span>Workflow Name</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newWorkflowName}
                  onChange={(e) => setNewWorkflowName(e.target.value)}
                  placeholder="e.g. Card Settlement Reconciliation Flow"
                  className="w-full text-xs font-semibold text-slate-900 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
                  required
                />
                <p className="text-[10px] text-slate-500">
                  Give this validation rule set a recognizable operational name.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800">Category</label>
                  <select
                    value={newWorkflowCategory}
                    onChange={(e) => setNewWorkflowCategory(e.target.value as any)}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                  >
                    <option value="Settlement">Settlement</option>
                    <option value="Reconciliation">Reconciliation</option>
                    <option value="Compliance">Compliance</option>
                    <option value="Fulfillment">Fulfillment</option>
                    <option value="Custom">Custom</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-800">Target Database</label>
                  <select
                    value={newWorkflowDbId}
                    onChange={(e) => {
                      const selDbId = e.target.value;
                      setNewWorkflowDbId(selDbId);
                      const selDb = dbList.find(d => d.id === selDbId);
                      const tbls = (selDb?.allowedTables && selDb.allowedTables.length > 0)
                        ? selDb.allowedTables
                        : (selDb?.availableTables || []);
                      setNewWorkflowTable(tbls[0] || '');
                    }}
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                  >
                    {dbList.map(db => (
                      <option key={db.id} value={db.id}>
                        {db.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800">Scope Table / View</label>
                  <span className="text-[9px] text-emerald-600 font-bold uppercase font-mono">From Allowed Tables</span>
                </div>
                {(() => {
                  const selDb = dbList.find(d => d.id === (newWorkflowDbId || dbList[0]?.id));
                  const tbls = (selDb?.allowedTables && selDb.allowedTables.length > 0)
                    ? selDb.allowedTables
                    : (selDb?.availableTables || []);

                  if (tbls.length === 0) {
                    return (
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={newWorkflowTable}
                          onChange={(e) => setNewWorkflowTable(e.target.value)}
                          placeholder="e.g. cur_trax"
                          className="w-full text-xs bg-white border border-amber-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          required
                        />
                        <p className="text-[10px] text-amber-600">No tables allowlisted by Admin for this DB yet.</p>
                      </div>
                    );
                  }

                  return (
                    <select
                      value={newWorkflowTable || tbls[0]}
                      onChange={(e) => setNewWorkflowTable(e.target.value)}
                      className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                      required
                    >
                      {tbls.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  );
                })()}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-800">Description (Optional)</label>
                <textarea
                  value={newWorkflowDescription}
                  onChange={(e) => setNewWorkflowDescription(e.target.value)}
                  placeholder="Operational context, investigated systems, or business purpose..."
                  rows={2}
                  className="w-full text-xs font-medium text-slate-900 bg-white border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewWorkflowModal(false)}
                  className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                >
                  Create Workflow
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

