import React, { useState, useEffect, useRef } from 'react';
import {
  GitFork,
  Boxes,
  Database,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ArrowRight,
  ArrowDown,
  Plus,
  Play,
  Save,
  Trash2,
  FolderOpen,
  Check,
  X,
  Layers,
  Sparkles,
  HelpCircle,
  Minimize2,
  Maximize2,
  Search,
  CheckSquare,
  FileSpreadsheet,
  Settings,
  Sliders,
  TrendingUp,
  RefreshCw,
  Move,
  Link2,
  Unlink,
  Eye,
  ShieldCheck,
  Info,
  AlignVerticalJustifyCenter,
  Edit2,
  Square,
  SlidersHorizontal,
  Users,
  Share2,
  Table,
  GripVertical,
  FileText,
  ChevronLeft
} from 'lucide-react';
import { api } from '../../api/client';
import { globalMappingService } from '../../services/globalMappingService';
import { showSystemAlert } from '../common/MessageModal';
import { ShareAssetModal } from '../common/ShareAssetModal';
import { AssetStatusBadge } from '../common/AssetStatusBadge';
import {
  ValidationBox,
  DatabaseValidationWorkflow,
  FlowchartNode,
  FlowchartConnection,
  FlowchartOutputAction,
  ProcessingStage,
  ValidationCheckStep,
  WorkflowMessageAggregationRule,
  MultiRowCardinalityPolicy,
  AggregationStrategy
} from '../../types';

import { WorkflowPalette } from './workflow/WorkflowPalette';
import { WorkflowInspector } from './workflow/WorkflowInspector';
import { WorkflowValidationSummary } from './workflow/WorkflowValidationSummary';
import { WorkflowStagesView } from './workflow/WorkflowStagesView';

interface WorkflowStudioFlowchartProps {
  currentUser?: any;
  selectedWorkflowId?: string;
  onSelectWorkflow?: (workflow: DatabaseValidationWorkflow) => void;
}

export const WorkflowStudioFlowchart: React.FC<WorkflowStudioFlowchartProps> = ({
  currentUser,
  selectedWorkflowId,
  onSelectWorkflow
}) => {
  const [workflows, setWorkflows] = useState<DatabaseValidationWorkflow[]>([]);
  const [validationBoxes, setValidationBoxes] = useState<ValidationBox[]>([]);
  const [databases, setDatabases] = useState<any[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<DatabaseValidationWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [extraCanvasHeight, setExtraCanvasHeight] = useState<number>(600);
  const [showShareModal, setShowShareModal] = useState<boolean>(false);

  // Message Aggregation Rules State
  const [messageAggregations, setMessageAggregations] = useState<WorkflowMessageAggregationRule[]>([]);
  const [showAggregatorModal, setShowAggregatorModal] = useState<boolean>(false);
  const [aggregatorTab, setAggregatorTab] = useState<'PASS' | 'FAIL'>('FAIL');
  const [isEditingRule, setIsEditingRule] = useState<boolean>(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  // Rule Form State
  const [formRuleName, setFormRuleName] = useState<string>('');
  const [formRuleMessage, setFormRuleMessage] = useState<string>('');
  const [formRuleOperator, setFormRuleOperator] = useState<'ALL' | 'ANY'>('ANY');
  const [formRuleSeverity, setFormRuleSeverity] = useState<'CRITICAL' | 'WARNING' | 'RECONCILED'>('CRITICAL');
  const [formSelectedStepIds, setFormSelectedStepIds] = useState<string[]>([]);
  const [aggregatorFeedback, setAggregatorFeedback] = useState<string>('');

  // Workflow metadata & Database configuration
  const [workflowName, setWorkflowName] = useState('Payment Reconciliation Pipeline');
  const [workflowCategory, setWorkflowCategory] = useState<'Settlement' | 'Fulfillment' | 'Compliance' | 'Reconciliation' | 'Custom'>('Settlement');
  const [workflowDescription, setWorkflowDescription] = useState('Vertical flowchart pipeline connecting search blocks and conditional checks.');
  const [workflowDbId, setWorkflowDbId] = useState<string>('');
  const [workflowTable, setWorkflowTable] = useState<string>('');
  const [workflowAttachedDbConfigIds, setWorkflowAttachedDbConfigIds] = useState<string[]>([]);

  // Flowchart Canvas State (Vertical Layout)
  const [nodes, setNodes] = useState<FlowchartNode[]>([]);
  const [connections, setConnections] = useState<FlowchartConnection[]>([]);

  // Interactive Dragging & Connecting State
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [wireSource, setWireSource] = useState<{ nodeId: string; port: 'pass' | 'fail' | 'output'; startX: number; startY: number } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Modal / Popover inspector states
  const [selectedNode, setSelectedNode] = useState<FlowchartNode | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<FlowchartConnection | null>(null);
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [paletteSearch, setPaletteSearch] = useState('');
  const [savedSnapshot, setSavedSnapshot] = useState<string>('');
  const [workflowViewMode, setWorkflowViewMode] = useState<'DAG' | 'LIST'>('DAG');
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(true);
  const [canvasTheme, setCanvasTheme] = useState<'dark' | 'light'>('light');

  const canvasRef = useRef<HTMLDivElement>(null);

  const createSnapshot = (
    wNodes: FlowchartNode[],
    wConns: FlowchartConnection[],
    wName: string,
    wCat: string,
    wDesc: string,
    wAggs: WorkflowMessageAggregationRule[],
    wDbId?: string,
    wTbl?: string,
    wAttachedDbConfigIds?: string[],
    // UI state parameters for complete snapshot
    wCanvasZoom?: number,
    wWorkflowViewMode?: 'DAG' | 'LIST',
    wLeftPanelCollapsed?: boolean,
    wRightPanelCollapsed?: boolean,
    wCanvasTheme?: 'dark' | 'light',
    wExtraCanvasHeight?: number
  ) => {
    return JSON.stringify({
      name: (wName || '').trim(),
      category: wCat || 'Settlement',
      description: (wDesc || '').trim(),
      targetDbId: wDbId || '',
      targetTable: wTbl || '',
      attachedDbConfigIds: (wAttachedDbConfigIds || []).slice().sort(),
      nodes: (wNodes || []).map(n => ({
        id: n.id,
        name: n.name,
        type: n.type,
        x: Math.round(n.x),
        y: Math.round(n.y),
        targetDbId: n.targetDbId,
        targetTable: n.targetTable,
        attachedDbConfigIds: n.attachedDbConfigIds,
        cardinalityPolicy: n.cardinalityPolicy,
        aggregationStrategy: n.aggregationStrategy,
        orderByColumn: n.orderByColumn,
        onPassAction: n.onPassAction,
        onFailAction: n.onFailAction,
        reportColumnName: n.reportColumnName,
        reportField: n.reportField
      })),
      connections: (wConns || []).map(c => ({
        id: c.id,
        fromNodeId: c.fromNodeId,
        fromPort: c.fromPort,
        toNodeId: c.toNodeId,
        action: c.action
      })),
      aggregations: (wAggs || []).map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        message: a.message,
        validationStepIds: a.validationStepIds,
        operator: a.operator,
        severity: a.severity
      })),
      // UI State for complete visual state preservation
      uiState: {
        canvasZoom: wCanvasZoom ?? 1,
        workflowViewMode: wWorkflowViewMode || 'DAG',
        leftPanelCollapsed: wLeftPanelCollapsed ?? false,
        rightPanelCollapsed: wRightPanelCollapsed ?? true,
        canvasTheme: wCanvasTheme || 'light',
        extraCanvasHeight: wExtraCanvasHeight ?? 600
      }
    });
  };

  const currentSnapshot = React.useMemo(() => {
    return createSnapshot(
      nodes,
      connections,
      workflowName,
      workflowCategory,
      workflowDescription,
      messageAggregations,
      workflowDbId,
      workflowTable,
      workflowAttachedDbConfigIds,
      canvasZoom,
      workflowViewMode,
      leftPanelCollapsed,
      rightPanelCollapsed,
      canvasTheme,
      extraCanvasHeight
    );
  }, [nodes, connections, workflowName, workflowCategory, workflowDescription, messageAggregations, workflowDbId, workflowTable, workflowAttachedDbConfigIds, canvasZoom, workflowViewMode, leftPanelCollapsed, rightPanelCollapsed, canvasTheme, extraCanvasHeight]);

  const hasUnsavedChanges = Boolean(savedSnapshot && savedSnapshot !== currentSnapshot);

  useEffect(() => {
    loadData();
  }, []);

  // Synchronize when selectedWorkflowId prop updates
  useEffect(() => {
    if (selectedWorkflowId && workflows.length > 0) {
      const matched = workflows.find(w => w && w.id === selectedWorkflowId);
      if (matched && matched.id !== activeWorkflow?.id) {
        selectWorkflow(matched);
      }
    }
  }, [selectedWorkflowId, workflows]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [wfs, boxes, dbs] = await Promise.all([
        api.getWorkflows(currentUser?.teamId),
        api.getValidationBoxes(undefined, currentUser?.teamId),
        api.getDatabases().catch(() => [])
      ]);
      const safeWfs = Array.isArray(wfs) ? wfs.filter(Boolean) : [];
      const safeBoxes = Array.isArray(boxes) ? boxes.filter(Boolean) : [];
      const safeDbs = Array.isArray(dbs) ? dbs.filter(Boolean) : [];
      setWorkflows(safeWfs);
      setValidationBoxes(safeBoxes);
      setDatabases(safeDbs);

      if (safeWfs.length > 0) {
        // Priority for active workflow selection:
        // 1. Explicit prop selectedWorkflowId
        // 2. First workflow in the list
        const matched = selectedWorkflowId ? safeWfs.find(w => w && w.id === selectedWorkflowId) : null;
        const targetWorkflow = matched || safeWfs[0];
        if (targetWorkflow) {
          selectWorkflow(targetWorkflow, safeBoxes);
        }
      } else {
        setActiveWorkflow(null);
        setWorkflowName('');
        setMessageAggregations([]);
        setWorkflowCategory('Settlement');
        setWorkflowDescription('');
        setNodes([]);
        setConnections([]);
      }
    } catch (err) {
      console.error('Failed to load workflow studio data:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Only returns validation blocks belonging to the active selected workflow
   */
  const workflowValidationBlocks = React.useMemo(() => {
    const fromNodes = (nodes || [])
      .filter(n => n && (n.type === 'VALIDATION_BOX' || n.type === 'RECONCILIATION' || n.type === 'REPORT' || n.boxId))
      .map(n => ({
        id: `step-${n.id}`,
        nodeId: String(n.id || ''),
        name: n.name || 'Validation Block',
        description: n.description || '',
        category: n.category || 'Validation Check',
        boxId: n.boxId
      }));
    if (fromNodes.length > 0) return fromNodes;
    if (activeWorkflow?.steps && Array.isArray(activeWorkflow.steps) && activeWorkflow.steps.length > 0) {
      return activeWorkflow.steps.filter(Boolean).map(s => ({
        id: s?.id || '',
        nodeId: s?.id ? String(s.id).replace(/^step-/, '') : '',
        name: s?.name || '',
        description: s?.description || '',
        category: s?.checkType || 'Validation Check',
        boxId: s?.id
      }));
    }
    return [];
  }, [nodes, activeWorkflow]);

  /**
   * Dynamically calculate canvas dimensions based on maximum node positions.
   * This guarantees infinite vertical scrolling without clipping.
   */
  const canvasDimensions = React.useMemo(() => {
    let maxY = 400;
    let maxX = 600;
    nodes.forEach(n => {
      if (typeof n.y === 'number' && n.y > maxY) maxY = n.y;
      if (typeof n.x === 'number' && n.x > maxX) maxX = n.x;
    });
    return {
      width: Math.max(1600, maxX + 600),
      height: Math.max(1800, maxY + extraCanvasHeight + 600)
    };
  }, [nodes, extraCanvasHeight]);

  const orderedNodes = React.useMemo(() => {
    return [...nodes].sort((a, b) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0));
  }, [nodes]);

  const selectWorkflow = (wf: DatabaseValidationWorkflow, availableBoxes?: ValidationBox[]) => {
    if (!wf) return;
    const boxesToUse = (availableBoxes || validationBoxes || []).filter(Boolean);
    setActiveWorkflow(wf);

    if (onSelectWorkflow) {
      onSelectWorkflow(wf);
    }

    setWorkflowName(wf.name || '');
    setWorkflowCategory(wf.category || 'Settlement');
    setWorkflowDescription(wf.description || '');
    setWorkflowDbId(wf.targetDbId || '');
    setWorkflowTable(wf.targetTable || '');
    const safeAttachedConfigs = Array.isArray(wf.attachedDbConfigIds)
      ? wf.attachedDbConfigIds.filter(Boolean)
      : [];
    setWorkflowAttachedDbConfigIds(safeAttachedConfigs);

    const rawAggs = wf.messageAggregations;
    const safeAggs = Array.isArray(rawAggs)
      ? rawAggs.filter(Boolean)
      : (rawAggs && typeof rawAggs === 'object' ? Object.values(rawAggs).filter(Boolean) : []);
    setMessageAggregations(safeAggs as WorkflowMessageAggregationRule[]);

    if (wf.nodes && Array.isArray(wf.nodes) && wf.nodes.length > 0) {
      const initialNodes = wf.nodes.filter(Boolean);
      const initialConns = Array.isArray(wf.connections) ? wf.connections.filter(Boolean) : [];
      setNodes(initialNodes);
      setConnections(initialConns);
      setSavedSnapshot(createSnapshot(
        initialNodes,
        initialConns,
        wf.name || '',
        wf.category || 'Settlement',
        wf.description || '',
        safeAggs as WorkflowMessageAggregationRule[],
        wf.targetDbId || '',
        wf.targetTable || '',
        safeAttachedConfigs,
        canvasZoom,
        workflowViewMode,
        leftPanelCollapsed,
        rightPanelCollapsed,
        canvasTheme,
        extraCanvasHeight
      ));
    } else {
      // Synthesize vertical flowchart nodes from existing stages & steps
      convertStagesToFlowchart(wf, boxesToUse, safeAggs as WorkflowMessageAggregationRule[]);
    }
  };

  /**
   * Converts linear, stage-based or step-based workflow into a clean VERTICAL flowchart
   */
  const convertStagesToFlowchart = (wf: DatabaseValidationWorkflow, availableBoxes: ValidationBox[], safeAggs?: WorkflowMessageAggregationRule[]) => {
    if (!wf) return;
    const safeBoxes = (availableBoxes || validationBoxes || []).filter(Boolean);
    const newNodes: FlowchartNode[] = [];
    const newConns: FlowchartConnection[] = [];

    const centerX = 320;
    let currentY = 40;

    // Start Node (Top)
    newNodes.push({
      id: 'node-start',
      type: 'START',
      name: 'Transaction Ingress',
      description: 'Incoming batch stream',
      x: centerX,
      y: currentY,
      onPassAction: 'CONTINUE',
      onFailAction: 'STOP'
    });

    let prevNodeId = 'node-start';
    currentY += 160;

    const steps = (wf.steps && Array.isArray(wf.steps)) ? wf.steps.filter(Boolean) : [];
    const stages = (wf.stages && Array.isArray(wf.stages)) ? wf.stages.filter(Boolean) : [];

    if (steps.length > 0) {
      steps.forEach((step, sIdx) => {
        if (!step) return;
        const stage = stages.find(st => st && st.id === step.stageId);
        const stageBoxes = stage ? safeBoxes.filter(b => b && (
          (stage.ruleBlockIds && Array.isArray(stage.ruleBlockIds) && stage.ruleBlockIds.includes(b.id)) ||
          (b.targetTable && stage.targetDataSource && b.targetTable === stage.targetDataSource)
        )) : [];
        const box = safeBoxes.find(b => b && (
          b.id === (step as any)?.boxId ||
          b.id === step?.id ||
          (b.name && step?.name && b.name.trim().toLowerCase() === step.name.trim().toLowerCase())
        )) || stageBoxes[0] || (safeBoxes.length > 0 ? safeBoxes[sIdx % safeBoxes.length] : undefined);

        const nodeId = `node-step-${step?.id || sIdx + 1}`;
        newNodes.push({
          id: nodeId,
          type: 'VALIDATION_BOX',
          boxId: box?.id || step?.id,
          name: step?.name || box?.name || `Validation Block ${sIdx + 1}`,
          description: step?.description || box?.description || 'Configured rule verification',
          category: box?.category || 'General',
          x: centerX,
          y: currentY,
          onPassAction: (step?.onPassAction as FlowchartOutputAction) || 'CONTINUE',
          onFailAction: (step?.onFailAction as FlowchartOutputAction) || 'STOP',
          reportColumnName: step?.reportColumnName || (sIdx === 0 ? 'Auth Status' : undefined),
          reportField: step?.reportField,
          targetDbId: step?.targetDbId || box?.targetDbId || stage?.targetDbId || wf.targetDbId,
          targetTable: step?.targetTable || box?.targetTable || stage?.targetDataSource || wf.targetTable,
          attachedDbConfigIds: (step as any)?.attachedDbConfigIds || step?.columnConfigurationIds || (box as any)?.attachedDbConfigIds || box?.columnConfigurationIds || stage?.attachedDbConfigIds || [],
          columnConfigurationIds: step?.columnConfigurationIds || box?.columnConfigurationIds || [],
          columnConfigurations: step?.columnConfigurations || box?.columnConfigurations || [],
          cardinalityPolicy: step?.cardinalityPolicy || stage?.cardinalityPolicy || 'STRICT_SINGLE',
          aggregationStrategy: step?.aggregationStrategy || stage?.aggregationStrategy || 'NONE',
          orderByColumn: step?.orderByColumn || stage?.orderByColumn
        });

        newConns.push({
          id: `conn-${prevNodeId}-${nodeId}`,
          fromNodeId: prevNodeId,
          fromPort: prevNodeId === 'node-start' ? 'output' : 'pass',
          toNodeId: nodeId,
          action: 'CONTINUE',
          label: 'Continue'
        });

        prevNodeId = nodeId;
        currentY += 190;
      });
    } else if (stages.length > 0) {
      stages.forEach((stage, sIdx) => {
        if (!stage) return;
        const stageBoxes = safeBoxes.filter(b => b && (
          (stage.ruleBlockIds && Array.isArray(stage.ruleBlockIds) && stage.ruleBlockIds.includes(b.id)) ||
          (b.targetTable && stage.targetDataSource && b.targetTable === stage.targetDataSource)
        ));
        const box = stageBoxes[0] || (safeBoxes.length > 0 ? safeBoxes[sIdx % safeBoxes.length] : undefined);

        const nodeId = `node-stage-${stage.id || sIdx + 1}`;
        newNodes.push({
          id: nodeId,
          type: 'VALIDATION_BOX',
          boxId: box?.id,
          name: box?.name || stage.name || `Validation Block ${sIdx + 1}`,
          description: box?.description || stage.description || 'Configured rule verification',
          category: box?.category || 'General',
          x: centerX,
          y: currentY,
          onPassAction: 'CONTINUE',
          onFailAction: 'STOP',
          reportColumnName: sIdx === 0 ? 'Auth Status' : undefined,
          targetDbId: box?.targetDbId || stage.targetDbId || wf.targetDbId,
          targetTable: box?.targetTable || stage.targetDataSource || wf.targetTable,
          attachedDbConfigIds: stage.attachedDbConfigIds || (box as any)?.attachedDbConfigIds || box?.columnConfigurationIds || [],
          columnConfigurationIds: box?.columnConfigurationIds || [],
          columnConfigurations: box?.columnConfigurations || [],
          cardinalityPolicy: stage.cardinalityPolicy || 'STRICT_SINGLE',
          aggregationStrategy: stage.aggregationStrategy || 'NONE',
          orderByColumn: stage.orderByColumn
        });

        newConns.push({
          id: `conn-${prevNodeId}-${nodeId}`,
          fromNodeId: prevNodeId,
          fromPort: prevNodeId === 'node-start' ? 'output' : 'pass',
          toNodeId: nodeId,
          action: 'CONTINUE',
          label: 'Continue'
        });

        prevNodeId = nodeId;
        currentY += 190;
      });
    }

    // End Outcome Node (Bottom)
    const endNodeId = 'node-end-reconciled';
    newNodes.push({
      id: endNodeId,
      type: 'END',
      name: 'Reconciled / Settled',
      description: 'Transaction cleared clean',
      x: centerX,
      y: currentY,
      onPassAction: 'CONTINUE',
      onFailAction: 'STOP'
    });

    newConns.push({
      id: `conn-${prevNodeId}-${endNodeId}`,
      fromNodeId: prevNodeId,
      fromPort: 'pass',
      toNodeId: endNodeId,
      action: 'CONTINUE',
      label: 'Settle Clean'
    });

    setNodes(newNodes);
    setConnections(newConns);
    setSavedSnapshot(createSnapshot(
      newNodes,
      newConns,
      wf.name || '',
      wf.category || 'Settlement',
      wf.description || '',
      safeAggs || [],
      wf.targetDbId || '',
      wf.targetTable || '',
      Array.isArray(wf.attachedDbConfigIds) ? wf.attachedDbConfigIds.filter(Boolean) : [],
      canvasZoom,
      workflowViewMode,
      leftPanelCollapsed,
      rightPanelCollapsed,
      canvasTheme,
      extraCanvasHeight
    ));
  };

  /**
   * Initializes a balanced vertical default flowchart with pass/fail branch paths
   */
  const initDefaultFlowchart = (availableBoxes: ValidationBox[]) => {
    setActiveWorkflow(null);
    setMessageAggregations([]);
    setWorkflowName('Two-Stage Reconciliation & Report Pipeline');
    setWorkflowCategory('Settlement');
    setWorkflowDescription('Search authorizations, report intermediate status into Investigation Grid, then verify settlement tolerances.');

    const searchBox = availableBoxes.find(b => b.boxType === 'INGESTION_SEARCH') || availableBoxes[0];
    const checkBox = availableBoxes.find(b => b.boxType === 'CONDITION_CHECK') || availableBoxes[1] || availableBoxes[0];

    const centerX = 320;

    const newNodes: FlowchartNode[] = [
      {
        id: 'start-1',
        type: 'START',
        name: 'Incoming Transactions',
        description: 'Uploaded task dataset batches',
        x: centerX,
        y: 40,
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP'
      },
      {
        id: 'box-node-1',
        type: 'VALIDATION_BOX',
        boxId: searchBox?.id,
        name: searchBox?.name || 'Auth Log Search & Ingest',
        description: 'Searches authorizations in target mirror database table',
        category: 'Ingestion',
        x: centerX,
        y: 190,
        onPassAction: 'REPORT', // Intermediate function: reports column to investigation view
        onFailAction: 'STOP',
        reportColumnName: 'Gateway Auth Response',
        reportField: 'response_code',
        targetDbId: searchBox?.targetDbId,
        targetTable: searchBox?.targetTable,
        columnConfigurationIds: searchBox?.columnConfigurationIds || [],
        columnConfigurations: searchBox?.columnConfigurations || []
      },
      {
        id: 'box-node-2',
        type: 'VALIDATION_BOX',
        boxId: checkBox?.id,
        name: checkBox?.name || 'Settlement Amount & Tolerance Check',
        description: 'Validates currency and net tolerance variance',
        category: 'Integrity',
        x: centerX,
        y: 380,
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP',
        reportColumnName: 'Tolerance Variance',
        reportField: 'amount',
        targetDbId: checkBox?.targetDbId,
        targetTable: checkBox?.targetTable,
        columnConfigurationIds: checkBox?.columnConfigurationIds || [],
        columnConfigurations: checkBox?.columnConfigurations || []
      },
      {
        id: 'end-reconciled',
        type: 'END',
        name: 'RECONCILED',
        description: 'Clean transaction closed',
        x: 180,
        y: 570,
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP'
      },
      {
        id: 'end-flagged',
        type: 'END',
        name: 'FLAGGED / SUPERVISOR',
        description: 'Discrepancy halted for manual review',
        x: 460,
        y: 570,
        onPassAction: 'STOP',
        onFailAction: 'STOP'
      }
    ];

    const newConns: FlowchartConnection[] = [
      {
        id: 'conn-1',
        fromNodeId: 'start-1',
        fromPort: 'output',
        toNodeId: 'box-node-1',
        action: 'CONTINUE',
        label: 'Stream Batch'
      },
      {
        id: 'conn-2',
        fromNodeId: 'box-node-1',
        fromPort: 'pass',
        toNodeId: 'box-node-2',
        action: 'REPORT',
        label: 'Report to Grid & Continue'
      },
      {
        id: 'conn-3',
        fromNodeId: 'box-node-1',
        fromPort: 'fail',
        toNodeId: 'end-flagged',
        action: 'STOP',
        label: 'Stop Pipeline'
      },
      {
        id: 'conn-4',
        fromNodeId: 'box-node-2',
        fromPort: 'pass',
        toNodeId: 'end-reconciled',
        action: 'CONTINUE',
        label: 'Reconcile'
      },
      {
        id: 'conn-5',
        fromNodeId: 'box-node-2',
        fromPort: 'fail',
        toNodeId: 'end-flagged',
        action: 'STOP',
        label: 'Flag Discrepancy'
      }
    ];

    setNodes(newNodes);
    setConnections(newConns);
  };

  const initIngressAuditFlowchart = (availableBoxes: ValidationBox[]) => {
    setActiveWorkflow(null);
    setMessageAggregations([]);
    setWorkflowName('Ingress & Audit Lookup Pipeline');
    setWorkflowCategory('Compliance');
    setWorkflowDescription('Single-stage lookup verifying existence and status in transaction mirror.');

    const box = availableBoxes[0];
    const centerX = 320;

    const newNodes: FlowchartNode[] = [
      {
        id: 'start-1',
        type: 'START',
        name: 'Transaction Batches',
        description: 'Uploaded datasets',
        x: centerX,
        y: 40,
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP'
      },
      {
        id: 'box-node-1',
        type: 'VALIDATION_BOX',
        boxId: box?.id,
        name: box?.name || 'Audit Existence Verification',
        description: 'Checks database mirror match',
        category: 'Audit',
        x: centerX,
        y: 200,
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP',
        targetDbId: box?.targetDbId,
        targetTable: box?.targetTable,
        columnConfigurationIds: box?.columnConfigurationIds || [],
        columnConfigurations: box?.columnConfigurations || []
      },
      {
        id: 'end-reconciled',
        type: 'END',
        name: 'AUDITED_CLEAN',
        description: 'Audit verified',
        x: 200,
        y: 380,
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP'
      },
      {
        id: 'end-flagged',
        type: 'END',
        name: 'AUDIT_EXCEPTION',
        description: 'Discrepancy flagged',
        x: 440,
        y: 380,
        onPassAction: 'STOP',
        onFailAction: 'STOP'
      }
    ];

    const newConns: FlowchartConnection[] = [
      {
        id: 'conn-start-box',
        fromNodeId: 'start-1',
        fromPort: 'output',
        toNodeId: 'box-node-1',
        action: 'CONTINUE',
        label: 'Process'
      },
      {
        id: 'conn-box-pass',
        fromNodeId: 'box-node-1',
        fromPort: 'pass',
        toNodeId: 'end-reconciled',
        action: 'CONTINUE',
        label: 'Valid'
      },
      {
        id: 'conn-box-fail',
        fromNodeId: 'box-node-1',
        fromPort: 'fail',
        toNodeId: 'end-flagged',
        action: 'STOP',
        label: 'Mismatch'
      }
    ];

    setNodes(newNodes);
    setConnections(newConns);
  };

  const initThreeWayMatchFlowchart = (availableBoxes: ValidationBox[]) => {
    setActiveWorkflow(null);
    setMessageAggregations([]);
    setWorkflowName('3-Way Match & Multi-Currency Pipeline');
    setWorkflowCategory('Reconciliation');
    setWorkflowDescription('Three-stage pipeline comparing terminal, gateway authorization, and core bank ledger.');

    const b1 = availableBoxes[0];
    const b2 = availableBoxes[1] || availableBoxes[0];
    const b3 = availableBoxes[2] || availableBoxes[0];
    const centerX = 320;

    const newNodes: FlowchartNode[] = [
      { id: 'start-1', type: 'START', name: 'File Ingress', description: 'Batch ingress', x: centerX, y: 40, onPassAction: 'CONTINUE', onFailAction: 'STOP' },
      { id: 'box-1', type: 'VALIDATION_BOX', boxId: b1?.id, name: b1?.name || 'Terminal Feed Match', description: 'Stage 1 match', category: 'Stage 1', x: centerX, y: 190, onPassAction: 'CONTINUE', onFailAction: 'STOP', targetDbId: b1?.targetDbId, targetTable: b1?.targetTable },
      { id: 'box-2', type: 'VALIDATION_BOX', boxId: b2?.id, name: b2?.name || 'Gateway Auth Cross-Check', description: 'Stage 2 match', category: 'Stage 2', x: centerX, y: 360, onPassAction: 'CONTINUE', onFailAction: 'STOP', targetDbId: b2?.targetDbId, targetTable: b2?.targetTable },
      { id: 'box-3', type: 'VALIDATION_BOX', boxId: b3?.id, name: b3?.name || 'Core Bank Ledger Post', description: 'Stage 3 match', category: 'Stage 3', x: centerX, y: 530, onPassAction: 'CONTINUE', onFailAction: 'STOP', targetDbId: b3?.targetDbId, targetTable: b3?.targetTable },
      { id: 'end-reconciled', type: 'END', name: '3-WAY RECONCILED', description: 'Complete match across all 3 ledgers', x: 200, y: 700, onPassAction: 'CONTINUE', onFailAction: 'STOP' },
      { id: 'end-flagged', type: 'END', name: 'LEDGER BREAK', description: 'Break identified', x: 440, y: 700, onPassAction: 'STOP', onFailAction: 'STOP' }
    ];

    const newConns: FlowchartConnection[] = [
      { id: 'conn-s-1', fromNodeId: 'start-1', fromPort: 'output', toNodeId: 'box-1', action: 'CONTINUE', label: 'Ingest' },
      { id: 'conn-1-2', fromNodeId: 'box-1', fromPort: 'pass', toNodeId: 'box-2', action: 'CONTINUE', label: 'Match 1' },
      { id: 'conn-1-f', fromNodeId: 'box-1', fromPort: 'fail', toNodeId: 'end-flagged', action: 'STOP', label: 'Break 1' },
      { id: 'conn-2-3', fromNodeId: 'box-2', fromPort: 'pass', toNodeId: 'box-3', action: 'CONTINUE', label: 'Match 2' },
      { id: 'conn-2-f', fromNodeId: 'box-2', fromPort: 'fail', toNodeId: 'end-flagged', action: 'STOP', label: 'Break 2' },
      { id: 'conn-3-e', fromNodeId: 'box-3', fromPort: 'pass', toNodeId: 'end-reconciled', action: 'CONTINUE', label: 'Reconciled' },
      { id: 'conn-3-f', fromNodeId: 'box-3', fromPort: 'fail', toNodeId: 'end-flagged', action: 'STOP', label: 'Break 3' }
    ];

    setNodes(newNodes);
    setConnections(newConns);
  };

  const handleApplyTemplate = (templateType: 'two_stage' | 'ingress_audit' | 'threeway_match') => {
    if (templateType === 'two_stage') {
      initDefaultFlowchart(validationBoxes);
    } else if (templateType === 'ingress_audit') {
      initIngressAuditFlowchart(validationBoxes);
    } else if (templateType === 'threeway_match') {
      initThreeWayMatchFlowchart(validationBoxes);
    }
  };

  const handleNewWorkflow = () => {
    setActiveWorkflow(null);
    setWorkflowName('New Validation Pipeline');
    setWorkflowCategory('Settlement');
    setWorkflowDescription('');
    setMessageAggregations([]);
    setNodes([
      {
        id: 'node-start',
        type: 'START',
        name: 'Transaction Ingress',
        description: 'Uploaded datasets',
        x: 320,
        y: 40,
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP'
      }
    ]);
    setConnections([]);
  };

  /**
   * Identifies whether a node is a Search & Ingestion process block (Rectangle) vs Condition Check (Rhombus)
   */
  const isNodeSearchBox = (node: FlowchartNode) => {
    if (!node || node.type === 'START' || node.type === 'END') return false;
    const safeBoxes = (validationBoxes || []).filter(Boolean);
    const box = safeBoxes.find(b => b && b.id === node.boxId);
    if (box) return box.boxType === 'INGESTION_SEARCH';
    if (node.targetTable && !node.name?.toLowerCase().includes('check')) return true;
    if (node.name?.toLowerCase().includes('search') || node.name?.toLowerCase().includes('ingest') || node.name?.toLowerCase().includes('auth log')) return true;
    return false;
  };

  /**
   * Initializes a brand new blank flowchart canvas
   */
  const handleCreateNewFlowchart = () => {
    setActiveWorkflow(null);
    setMessageAggregations([]);
    setWorkflowName(`Custom Workflow ${workflows.length + 1}`);
    setWorkflowCategory('Settlement');
    setWorkflowDescription('Vertical flowchart connecting ingestion search and condition verification blocks.');

    const centerX = 340;
    const newNodes: FlowchartNode[] = [
      {
        id: `start-${Date.now()}`,
        type: 'START',
        name: 'Transaction Ingress',
        description: 'Batch transactions stream entry',
        x: centerX,
        y: 40,
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP'
      }
    ];
    setNodes(newNodes);
    setConnections([]);
    setSelectedNode(null);
    setSelectedConnection(null);
    setSaveSuccessMsg('Started new blank flowchart. Drag blocks from the left toolbox palette and connect downwards.');
    setTimeout(() => setSaveSuccessMsg(''), 4000);
  };

  /**
   * Deletes the currently selected workflow
   */
  const handleDeleteWorkflow = async () => {
    if (!activeWorkflow || !activeWorkflow.id) return;
    const wfName = activeWorkflow.name || 'Untitled Workflow';
    const wfId = activeWorkflow.id;
    if (!window.confirm(`Are you sure you want to permanently delete workflow "${wfName}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await api.deleteWorkflow(wfId);
      setActiveWorkflow(null);
      await loadData();
      showSystemAlert({
        title: 'Workflow Deleted',
        message: `Workflow "${wfName}" has been permanently deleted from PostgreSQL.`,
        type: 'success'
      });
    } catch (err: any) {
      showSystemAlert({
        title: 'Delete Failed',
        message: `Failed to delete workflow: ${err.message || err}`,
        type: 'error'
      });
    }
  };

  /**
   * One-click Auto Align Vertically: cleans up user coordinates into a straight top-to-bottom layout
   */

  const resetRuleForm = (type: 'PASS' | 'FAIL') => {
    setIsEditingRule(false);
    setEditingRuleId(null);
    setFormRuleName('');
    setFormRuleMessage('');
    setFormRuleOperator(type === 'FAIL' ? 'ANY' : 'ALL');
    setFormRuleSeverity(type === 'FAIL' ? 'CRITICAL' : 'RECONCILED');
    setFormSelectedStepIds([]);
  };

  const handleStartNewRule = (type: 'PASS' | 'FAIL') => {
    resetRuleForm(type);
    setIsEditingRule(true);
    if (workflowValidationBlocks.length > 0) {
      setFormSelectedStepIds([workflowValidationBlocks[0].id]);
    }
  };

  const handleEditRule = (rule: WorkflowMessageAggregationRule) => {
    setEditingRuleId(rule.id);
    setIsEditingRule(true);
    setFormRuleName(rule.name);
    setFormRuleMessage(rule.message);
    setFormRuleOperator(rule.operator || (rule.type === 'FAIL' ? 'ANY' : 'ALL'));
    setFormRuleSeverity(rule.severity || (rule.type === 'FAIL' ? 'CRITICAL' : 'RECONCILED'));
    setFormSelectedStepIds(rule.validationStepIds || []);
  };

  const handleDeleteRule = (ruleId: string) => {
    setMessageAggregations(prev => prev.filter(r => r.id !== ruleId));
  };

  const handleSaveRule = () => {
    if (!formRuleName.trim()) {
      showSystemAlert({
        title: 'Validation Warning',
        message: 'Please enter a descriptive Rule Name.',
        type: 'warning'
      });
      return;
    }
    if (!formRuleMessage.trim()) {
      showSystemAlert({
        title: 'Validation Warning',
        message: 'Please enter the Consolidated Outcome Message text.',
        type: 'warning'
      });
      return;
    }
    if (formSelectedStepIds.length === 0) {
      showSystemAlert({
        title: 'Validation Warning',
        message: 'Please select at least one validation block to attach to this message.',
        type: 'warning'
      });
      return;
    }

    const newRule: WorkflowMessageAggregationRule = {
      id: editingRuleId || `agg-rule-${Date.now()}`,
      name: formRuleName.trim(),
      type: aggregatorTab,
      message: formRuleMessage.trim(),
      validationStepIds: formSelectedStepIds,
      operator: formRuleOperator,
      severity: formRuleSeverity
    };

    setMessageAggregations(prev => {
      if (editingRuleId) {
        return prev.map(r => r.id === editingRuleId ? newRule : r);
      } else {
        return [...prev, newRule];
      }
    });

    setIsEditingRule(false);
    setEditingRuleId(null);
    setAggregatorFeedback(`Saved rule "${newRule.name}". Click "Save & Attach to Workflow" to persist changes.`);
    setTimeout(() => setAggregatorFeedback(''), 4000);
  };

  const handleSaveAndApplyAggregations = async () => {
    try {
      await handleSaveWorkflow(messageAggregations);
      setAggregatorFeedback('Message aggregations saved and attached to workflow!');
      setTimeout(() => {
        setAggregatorFeedback('');
        setShowAggregatorModal(false);
      }, 1200);
    } catch (err: any) {
      showSystemAlert({
        title: 'Save Aggregations Failed',
        message: `Failed to save aggregations: ${err.message || err}`,
        type: 'error'
      });
    }
  };

  const handleAutoAlignVertical = () => {
    const centerX = 320;
    let currentY = 40;

    const startNode = nodes.find(n => n.type === 'START');
    const nonTerminalNodes = nodes.filter(n => n.type !== 'START' && n.type !== 'END');
    const endNodes = nodes.filter(n => n.type === 'END');

    const updated = nodes.map(n => {
      if (n.type === 'START') {
        return { ...n, x: centerX, y: 40 };
      }
      return n;
    });

    currentY = 160;
    nonTerminalNodes.forEach((b) => {
      const target = updated.find(u => u.id === b.id);
      if (target) {
        const isSearch = isNodeSearchBox(b);
        target.x = centerX - 10;
        target.y = currentY;
        currentY += isSearch ? 190 : 250; // Rhombuses are 210px tall, Rectangles are 140px tall
      }
    });

    if (endNodes.length === 1) {
      const target = updated.find(u => u.id === endNodes[0].id);
      if (target) {
        target.x = centerX;
        target.y = currentY + 20;
      }
    } else if (endNodes.length > 1) {
      endNodes.forEach((en, idx) => {
        const target = updated.find(u => u.id === en.id);
        if (target) {
          target.x = 180 + idx * 280;
          target.y = currentY + 20;
        }
      });
    }

    setNodes([...updated]);
  };

  // Node Drag Handlers (Account for scroll offsets for infinite vertical canvas)
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === nodeId);
    if (!node || !canvasRef.current) return;

    setSelectedNode(node);
    setSelectedConnection(null);
    setRightPanelCollapsed(false);

    const rect = canvasRef.current.getBoundingClientRect();
    const scrollLeft = canvasRef.current.scrollLeft || 0;
    const scrollTop = canvasRef.current.scrollTop || 0;

    setDraggingNodeId(nodeId);
    setDragOffset({
      x: (e.clientX - rect.left + scrollLeft) / canvasZoom - node.x,
      y: (e.clientY - rect.top + scrollTop) / canvasZoom - node.y
    });
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scrollLeft = canvasRef.current.scrollLeft || 0;
    const scrollTop = canvasRef.current.scrollTop || 0;

    const curX = (e.clientX - rect.left + scrollLeft) / canvasZoom;
    const curY = (e.clientY - rect.top + scrollTop) / canvasZoom;
    setMousePos({ x: curX, y: curY });

    if (draggingNodeId) {
      setNodes(prev => prev.map(n => {
        if (n.id === draggingNodeId) {
          const newY = Math.max(10, Math.round(curY - dragOffset.y));
          // Dynamically extend canvas if dragging near the bottom limit
          if (newY + 400 > canvasDimensions.height) {
            setExtraCanvasHeight(h => h + 400);
          }
          return {
            ...n,
            x: Math.max(10, Math.round(curX - dragOffset.x)),
            y: newY
          };
        }
        return n;
      }));
    }
  };

  const handleCanvasMouseUp = () => {
    if (draggingNodeId) {
      setDraggingNodeId(null);
    }
    if (wireSource) {
      setWireSource(null);
    }
  };

  // Wire Connection Drawing Handlers (Vertical: from bottom ports downwards)
  const handleStartWire = (e: React.MouseEvent, nodeId: string, port: 'pass' | 'fail' | 'output') => {
    e.stopPropagation();
    const pt = getNodeCenter(nodeId, port);
    setWireSource({
      nodeId,
      port,
      startX: pt.x,
      startY: pt.y
    });
  };

  const handleCompleteWire = (e: React.MouseEvent, targetNodeId: string) => {
    e.stopPropagation();
    if (!wireSource) return;

    // Prevent connecting to self
    if (wireSource.nodeId === targetNodeId) {
      setWireSource(null);
      return;
    }

    // Determine default action from source node configuration
    const sourceNode = nodes.find(n => n.id === wireSource.nodeId);
    const defaultAction: FlowchartOutputAction = wireSource.port === 'fail'
      ? (sourceNode?.onFailAction || 'STOP')
      : (sourceNode?.onPassAction || 'CONTINUE');

    // Remove any existing connection from this specific port
    const filteredConns = connections.filter(
      c => !(c.fromNodeId === wireSource.nodeId && c.fromPort === wireSource.port)
    );

    const newConn: FlowchartConnection = {
      id: `conn-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      fromNodeId: wireSource.nodeId,
      fromPort: wireSource.port,
      toNodeId: targetNodeId,
      action: defaultAction,
      label: defaultAction === 'STOP' ? 'Stop' : 'Continue'
    };

    setConnections([...filteredConns, newConn]);
    setWireSource(null);

    // Open connection inspector to allow user to configure CONTINUE / STOP / REPORT
    setSelectedConnection(newConn);
    setRightPanelCollapsed(false);
  };

  const handleDeleteConnection = (connId: string) => {
    setConnections(prev => prev.filter(c => c.id !== connId));
    if (selectedConnection?.id === connId) {
      setSelectedConnection(null);
      setRightPanelCollapsed(true);
    }
  };

  const handleDeleteNode = (nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setConnections(prev => prev.filter(c => c.fromNodeId !== nodeId && c.toNodeId !== nodeId));
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
      setRightPanelCollapsed(true);
    }
  };

  const handleAddBoxNode = (box: ValidationBox) => {
    const initialPassAction: FlowchartOutputAction = (box.checkStep?.actionOnSuccess === 'STOP' || box.checkStep?.onPassAction === 'STOP')
      ? 'STOP'
      : ((box.checkStep?.onPassAction as FlowchartOutputAction) || 'CONTINUE');
    const initialFailAction: FlowchartOutputAction = (box.checkStep?.actionOnFailure === 'CONTINUE' || box.checkStep?.onFailAction === 'CONTINUE')
      ? 'CONTINUE'
      : 'STOP';

    const maxY = nodes.length > 0 ? Math.max(...nodes.map(n => n.y || 0)) : 0;
    const newY = nodes.length === 0 ? 40 : maxY + 180;

    const newNode: FlowchartNode = {
      id: `box-node-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      type: 'VALIDATION_BOX',
      boxId: box.id,
      name: box.name,
      description: box.description || (box.boxType === 'INGESTION_SEARCH' ? 'Ingestion and mirror lookup' : 'Condition verification'),
      category: box.category || 'General',
      x: 320,
      y: newY,
      onPassAction: initialPassAction,
      onFailAction: initialFailAction,
      targetDbId: box.targetDbId || workflowDbId,
      targetTable: box.targetTable || workflowTable,
      attachedDbConfigIds: (box as any).attachedDbConfigIds || box.columnConfigurationIds || box.checkStep?.columnConfigurationIds || [],
      columnConfigurationIds: box.columnConfigurationIds || box.checkStep?.columnConfigurationIds || [],
      columnConfigurations: box.columnConfigurations || box.checkStep?.columnConfigurations || [],
      cardinalityPolicy: (box as any).cardinalityPolicy || 'STRICT_SINGLE',
      aggregationStrategy: (box as any).aggregationStrategy || 'NONE',
      orderByColumn: (box as any).orderByColumn
    };
    setNodes(prev => [...prev, newNode]);

    // Automatically scroll down to the newly placed block
    setTimeout(() => {
      if (canvasRef.current) {
        canvasRef.current.scrollTo({ top: Math.max(0, newY - 200), behavior: 'smooth' });
      }
    }, 50);
  };

  const handleAddTerminalNode = (type: 'START' | 'END', name: string) => {
    const maxY = nodes.length > 0 ? Math.max(...nodes.map(n => n.y || 0)) : 40;
    const newY = type === 'START' ? 40 : maxY + 180;
    const newNode: FlowchartNode = {
      id: `terminal-${Date.now()}`,
      type,
      name,
      description: type === 'START' ? 'Batch Ingress entry' : 'Final workflow termination',
      x: 320,
      y: newY,
      onPassAction: 'CONTINUE',
      onFailAction: 'STOP'
    };
    setNodes(prev => [...prev, newNode]);

    // Automatically scroll to the new terminal node
    setTimeout(() => {
      if (canvasRef.current) {
        canvasRef.current.scrollTo({ top: Math.max(0, newY - 200), behavior: 'smooth' });
      }
    }, 50);
  };

  const handleSaveWorkflow = async (overrideAggregations?: WorkflowMessageAggregationRule[]) => {
    if (!workflowName.trim()) {
      showSystemAlert({
        title: 'Workflow Name Required',
        message: 'Please enter a name for the workflow before saving.',
        type: 'warning'
      });
      return;
    }

    setIsSaving(true);
    setSaveSuccessMsg('');

    try {
      // Synchronize flowchart nodes into structured stages and steps for execution
      const validNodes = (nodes || []).filter(Boolean);
      const validationNodes = validNodes.filter(n => n && (n.type === 'VALIDATION_BOX' || n.type === 'RECONCILIATION' || n.type === 'REPORT'));
      const safeBoxes = (validationBoxes || []).filter(Boolean);

      // Pre-save topology & configuration checks (Risk 2 Hardening)
      const nonTerminalNodes = validNodes.filter(n => n.type !== 'START' && n.type !== 'END');
      if (nonTerminalNodes.length > 0) {
        // 1. Check for external DB nodes without search parameters
        for (const vNode of validationNodes) {
          const box = safeBoxes.find(b => b && (
            b.id === vNode.boxId ||
            (b.name && vNode.name && b.name.trim().toLowerCase() === vNode.name.trim().toLowerCase())
          ));
          const hasTargetDb = Boolean(vNode.targetTable || box?.targetTable);
          const hasSearchParams = Boolean(
            (Array.isArray(box?.searchParameters) && box.searchParameters.length > 0) ||
            (Array.isArray((vNode as any).searchParameters) && (vNode as any).searchParameters.length > 0) ||
            (Array.isArray(box?.checkStep?.requiredParams) && box.checkStep.requiredParams.length > 0)
          );
          if (hasTargetDb && !hasSearchParams) {
            showSystemAlert({
              title: 'Validation Block Search Parameters Missing',
              message: `Validation node "${vNode.name || vNode.id}" targets table "${vNode.targetTable || box?.targetTable}", but has no search parameters defined for database matching. Please configure search parameters in the node or Validation Box to prevent incorrect cross-record matching.`,
              type: 'warning'
            });
            setIsSaving(false);
            return;
          }
        }

        // 2. Disconnected node check (if multiple nodes exist)
        if (validNodes.length > 2) {
          const connectedNodeIds = new Set<string>();
          (connections || []).forEach(c => {
            if (c.fromNodeId) connectedNodeIds.add(c.fromNodeId);
            if (c.toNodeId) connectedNodeIds.add(c.toNodeId);
          });
          const disconnected = nonTerminalNodes.find(n => !connectedNodeIds.has(n.id));
          if (disconnected) {
            showSystemAlert({
              title: 'Disconnected Node Detected',
              message: `Node "${disconnected.name || disconnected.id}" is not connected to the pipeline flowchart. Connect all stages before saving to prevent unreachable validation paths.`,
              type: 'warning'
            });
            setIsSaving(false);
            return;
          }
        }
      }

      const stages: ProcessingStage[] = validationNodes.map((n, idx) => ({
        id: `stage-${n.id || idx + 1}`,
        name: String(n.name || `Stage ${idx + 1}`),
        description: String(n.description || ''),
        order: idx + 1,
        enabled: true,
        targetDbId: String(n.targetDbId || workflowDbId || ''),
        targetDataSource: String(n.targetTable || workflowTable || 'transactions'),
        businessMeaning: String(n.category || 'Validation Stage'),
        ruleBlockIds: n.boxId ? [String(n.boxId)] : [],
        attachedDbConfigIds: (Array.isArray(n.attachedDbConfigIds) && n.attachedDbConfigIds.length > 0)
          ? n.attachedDbConfigIds
          : ((Array.isArray(n.columnConfigurationIds) && n.columnConfigurationIds.length > 0)
            ? n.columnConfigurationIds
            : (workflowAttachedDbConfigIds.length > 0 && (!n.targetDbId || n.targetDbId === workflowDbId) && (!n.targetTable || n.targetTable === workflowTable)
              ? workflowAttachedDbConfigIds
              : []
            )
          ),
        cardinalityPolicy: n.cardinalityPolicy || 'STRICT_SINGLE',
        aggregationStrategy: n.aggregationStrategy || 'NONE',
        orderByColumn: n.orderByColumn
      }));

      const steps: ValidationCheckStep[] = validationNodes.map((n, idx) => {
        const box = safeBoxes.find(b => b && (
          b.id === n.boxId ||
          (b.name && n.name && b.name.trim().toLowerCase() === n.name.trim().toLowerCase())
        ));
        let checkType: any = 'EXISTENCE_CHECK';
        const dsc = box?.dualSourceCondition || box?.checkStep?.dualSourceCondition;

        if (dsc) {
          checkType = 'DUAL_SOURCE_COMPARISON';
        } else if (box?.boxType === 'INGESTION_SEARCH' || box?.boxType === 'RECONCILIATION' || n.type === 'RECONCILIATION') {
          checkType = 'EXISTENCE_CHECK';
        } else if (box?.boxType === 'REPORT' || n.type === 'REPORT') {
          checkType = 'STATUS_MATCH';
        } else {
          checkType = box?.checkStep?.checkType || 'FIELD_COMPARATOR';
        }

        // Search parameters: Check box.searchParameters or node searchParameters regardless of boxType
        const rawSearchParams = (Array.isArray(box?.searchParameters) && box.searchParameters.length > 0)
          ? box.searchParameters
          : ((n as any).searchParameters && Array.isArray((n as any).searchParameters) ? (n as any).searchParameters : []);

        const firstSearchParam = rawSearchParams.length > 0 ? rawSearchParams[0] : null;
        const firstReqParam = (box?.checkStep?.requiredParams && box.checkStep.requiredParams.length > 0)
          ? box.checkStep.requiredParams[0]
          : null;

        // Strict decoupling: sourceField and targetField define what is evaluated on the record;
        // searchParameters define how records are queried in the external DB.
        const srcField = dsc?.sourceA?.field ||
          box?.checkStep?.sourceField ||
          box?.checkStep?.canonicalField ||
          (n as any).sourceField ||
          firstSearchParam?.inputField ||
          firstReqParam ||
          '';

        const tgtField = dsc?.sourceB?.field ||
          box?.checkStep?.targetField ||
          (n as any).targetField ||
          firstSearchParam?.targetColumn ||
          firstSearchParam?.inputField ||
          firstReqParam ||
          srcField ||
          '';

        const compareVal = (n as any).compareValue ?? dsc?.compareValue ?? box?.checkStep?.compareValue;
        const expectedVal = (n as any).expectedValue ?? dsc?.expectedValue ?? box?.checkStep?.expectedValue;

        const effectiveStepAttachedConfigs = (Array.isArray(n.attachedDbConfigIds) && n.attachedDbConfigIds.length > 0)
          ? n.attachedDbConfigIds
          : ((Array.isArray(n.columnConfigurationIds) && n.columnConfigurationIds.length > 0)
            ? n.columnConfigurationIds
            : (box?.attachedDbConfigIds || (workflowAttachedDbConfigIds.length > 0 && (!n.targetDbId || n.targetDbId === workflowDbId) && (!n.targetTable || n.targetTable === workflowTable) ? workflowAttachedDbConfigIds : []))
          );

        return {
          id: `step-${n.id || idx + 1}`,
          stepNumber: idx + 1,
          name: String(n.name || `Step ${idx + 1}`),
          description: String(n.description || ''),
          stageId: `stage-${n.id || idx + 1}`,
          checkType,
          dualSourceCondition: dsc ? JSON.parse(JSON.stringify(dsc)) : undefined,
          toleranceMargin: Number(dsc?.toleranceMargin ?? box?.checkStep?.toleranceMargin ?? box?.checkStep?.tolerance ?? 0.00),
          targetDbId: String(n.targetDbId || box?.targetDbId || workflowDbId || ''),
          targetTable: String(n.targetTable || box?.targetTable || workflowTable || 'transactions'),
          attachedDbConfigIds: effectiveStepAttachedConfigs,
          cardinalityPolicy: n.cardinalityPolicy || (box as any)?.cardinalityPolicy || 'STRICT_SINGLE',
          aggregationStrategy: n.aggregationStrategy || (box as any)?.aggregationStrategy || 'NONE',
          orderByColumn: n.orderByColumn || (box as any)?.orderByColumn,
          sourceField: String(srcField),
          targetField: String(tgtField),
          comparator: (dsc?.comparator === 'EQUALS' ? '=' : (dsc?.comparator as any)) || box?.checkStep?.comparator || (box?.checkStep?.operator as any) || '=',
          compareValue: compareVal !== undefined ? String(compareVal) : undefined,
          expectedValue: expectedVal !== undefined ? String(expectedVal) : undefined,
          regexPattern: box?.checkStep?.regexPattern || (n as any).regexPattern ? String(box?.checkStep?.regexPattern || (n as any).regexPattern) : undefined,
          sqlCondition: box?.checkStep?.sqlCondition || (n as any).sqlCondition ? String(box?.checkStep?.sqlCondition || (n as any).sqlCondition) : undefined,
          columnConfigurationIds: effectiveStepAttachedConfigs,
          columnConfigurations: n.columnConfigurations || box?.columnConfigurations || box?.checkStep?.columnConfigurations || [],
          onPassAction: n.onPassAction || (box?.checkStep?.onPassAction as any) || 'CONTINUE',
          onFailAction: n.onFailAction || (box?.checkStep?.onFailAction as any) || (box?.checkStep?.actionOnFailure as any) || 'STOP',
          onErrorAction: 'STOP',
          reportColumnName: n.reportColumnName ? String(n.reportColumnName) : undefined,
          reportField: (n.reportField || box?.checkStep?.sourceField) ? String(n.reportField || box?.checkStep?.sourceField) : undefined,
          dependencyCondition: (idx === 0 || (idx > 0 && validationNodes[idx - 1]?.onFailAction === 'CONTINUE')) ? 'ALWAYS' : 'IF_PREV_SUCCESS',
          requiredParams: (() => {
            if (rawSearchParams.length > 0) {
              const spReqs = rawSearchParams
                .filter((p: any) => p && p.required !== false)
                .map((p: any) => p.inputField || p.targetColumn)
                .filter(Boolean)
                .map(String);
              if (spReqs.length > 0) return spReqs;
            }
            if (box?.checkStep?.requiredParams && box.checkStep.requiredParams.length > 0) {
              return box.checkStep.requiredParams.map(String);
            }
            if (dsc) {
              const reqs: string[] = [];
              if (dsc.sourceA?.field) reqs.push(String(dsc.sourceA.field));
              if (dsc.sourceB?.field) reqs.push(String(dsc.sourceB.field));
              return reqs;
            }
            return (srcField ? [String(srcField)] : []);
          })(),
          searchParameters: rawSearchParams.length > 0 ? JSON.parse(JSON.stringify(rawSearchParams)) : undefined
        };
      });

      // Strict sanitization: Strip non-serializable properties and preserve boxId and searchParameters
      const cleanNodes: FlowchartNode[] = validNodes.map((n, idx) => {
        const box = safeBoxes.find(b => b && (
          b.id === n.boxId ||
          (b.name && n.name && b.name.trim().toLowerCase() === n.name.trim().toLowerCase())
        ));
        const effectiveNodeAttached = (Array.isArray(n.attachedDbConfigIds) && n.attachedDbConfigIds.length > 0)
          ? n.attachedDbConfigIds
          : ((Array.isArray(n.columnConfigurationIds) && n.columnConfigurationIds.length > 0)
            ? n.columnConfigurationIds
            : (box?.attachedDbConfigIds || (workflowAttachedDbConfigIds.length > 0 && (!n.targetDbId || n.targetDbId === workflowDbId) && (!n.targetTable || n.targetTable === workflowTable) ? workflowAttachedDbConfigIds : []))
          );

        return {
          id: String(n.id || `node-${idx + 1}`),
          type: n.type,
          boxId: n.boxId ? String(n.boxId) : (box?.id ? String(box.id) : undefined),
          name: String(n.name || ''),
          description: String(n.description || ''),
          category: n.category ? String(n.category) : undefined,
          x: Math.round(Number(n.x) || 0),
          y: Math.round(Number(n.y) || 0),
          targetDbId: n.targetDbId ? String(n.targetDbId) : (box?.targetDbId ? String(box.targetDbId) : (workflowDbId || undefined)),
          targetTable: n.targetTable ? String(n.targetTable) : (box?.targetTable ? String(box.targetTable) : (workflowTable || undefined)),
          attachedDbConfigIds: effectiveNodeAttached,
          columnConfigurationIds: effectiveNodeAttached,
          columnConfigurations: n.columnConfigurations || box?.columnConfigurations || [],
          cardinalityPolicy: n.cardinalityPolicy || (box as any)?.cardinalityPolicy || 'STRICT_SINGLE',
          aggregationStrategy: n.aggregationStrategy || (box as any)?.aggregationStrategy || 'NONE',
          orderByColumn: n.orderByColumn || (box as any)?.orderByColumn,
          onPassAction: n.onPassAction || 'CONTINUE',
          onFailAction: n.onFailAction || 'STOP',
          reportColumnName: n.reportColumnName ? String(n.reportColumnName) : undefined,
          reportField: n.reportField ? String(n.reportField) : undefined,
          searchParameters: (n as any).searchParameters || box?.searchParameters,
          sourceField: (n as any).sourceField || box?.checkStep?.sourceField,
          targetField: (n as any).targetField || box?.checkStep?.targetField
        } as any;
      });

      const cleanConnections: FlowchartConnection[] = (connections || []).filter(Boolean).map((c, idx) => ({
        id: String(c.id || `conn-${idx + 1}`),
        fromNodeId: String(c.fromNodeId || ''),
        fromPort: c.fromPort,
        toNodeId: String(c.toNodeId || ''),
        toPort: c.toPort || 'input',
        action: c.action || 'CONTINUE',
        label: String(c.label || '')
      }));

      const rawAggs = overrideAggregations !== undefined ? overrideAggregations : messageAggregations;
      const aggsArray: any[] = Array.isArray(rawAggs)
        ? rawAggs
        : (rawAggs && typeof rawAggs === 'object' ? Object.values(rawAggs) : []);
      const cleanAggregations: WorkflowMessageAggregationRule[] = aggsArray
        .filter(Boolean)
        .map((r, idx) => ({
          id: String(r?.id || `agg-${Date.now()}-${idx + 1}-${Math.random().toString(36).substring(2, 6)}`),
          name: String(r?.name || ''),
          type: r?.type || 'FAIL',
          message: String(r?.message || ''),
          validationStepIds: Array.isArray(r?.validationStepIds) ? r.validationStepIds.filter(Boolean).map(String) : [],
          operator: r?.operator || 'ANY',
          severity: r?.severity || 'CRITICAL'
        }));

      const payload: Partial<DatabaseValidationWorkflow> = {
        name: workflowName.trim(),
        category: workflowCategory,
        description: workflowDescription.trim(),
        targetDbId: workflowDbId || undefined,
        targetTable: workflowTable || undefined,
        attachedDbConfigIds: workflowAttachedDbConfigIds,
        stages,
        steps,
        nodes: cleanNodes,
        connections: cleanConnections,
        globalSuccessMessage: 'All flowchart stages evaluated successfully.',
        globalFailureMessage: 'Discrepancy identified in validation flowchart.',
        messageAggregations: cleanAggregations
      };

      let savedWf = null;
      if (activeWorkflow && activeWorkflow.id) {
        savedWf = await api.updateWorkflow(activeWorkflow.id, payload);
      } else {
        const newId = `wf-${Date.now()}`;
        savedWf = await api.createWorkflow({
          id: newId,
          teamId: currentUser?.teamId || 'team-cards',
          isPublic: true,
          visibility: 'team',
          ...payload
        });
      }

      setSaveSuccessMsg('Vertical Flowchart saved! Intermediate Report columns are now synced with Investigation View.');
      setTimeout(() => setSaveSuccessMsg(''), 4000);

      const refreshed = await api.getWorkflows(currentUser?.teamId);
      const safeRefreshed = Array.isArray(refreshed) ? refreshed.filter(Boolean) : [];
      setWorkflows(safeRefreshed);
      const targetId = savedWf?.id || (activeWorkflow ? activeWorkflow.id : '');
      const match = safeRefreshed.find((w: any) => w && w.id === targetId);
      const matchedWorkflow = match
        ? { ...match, nodes: cleanNodes, connections: cleanConnections }
        : (savedWf ? { ...savedWf, nodes: cleanNodes, connections: cleanConnections } : null);
      if (matchedWorkflow) {
        selectWorkflow(matchedWorkflow);
      }
    } catch (err: any) {
      showSystemAlert({
        title: 'Save Failed',
        message: `Failed to save workflow: ${err.message || err}`,
        type: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Calculates precise connection point coordinates for vertical top-to-bottom layout
   */
  const getNodeCenter = (nodeId: string, port: 'input' | 'pass' | 'fail' | 'output') => {
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return { x: 0, y: 0 };

    // Terminal Node (START / END) -> Stadium Oval (w: 240, h: 52)
    if (node.type === 'START' || node.type === 'END') {
      const width = 240;
      const height = 52;
      if (port === 'input') return { x: node.x + width / 2, y: node.y };
      return { x: node.x + width / 2, y: node.y + height };
    }

    // Process / Condition / Ingestion / Reconciliation / Report Box (w: 280, h: 185)
    const width = 280;
    const height = 185;
    if (port === 'input') return { x: node.x + width / 2, y: node.y };
    if (port === 'pass') return { x: node.x + 48, y: node.y + height };
    if (port === 'fail') return { x: node.x + width - 48, y: node.y + height };
    return { x: node.x + width / 2, y: node.y + height };
  };

  const filteredBoxes = validationBoxes.filter(b =>
    b.name.toLowerCase().includes(paletteSearch.toLowerCase()) ||
    (b.targetTable && b.targetTable.toLowerCase().includes(paletteSearch.toLowerCase()))
  );

  const canvasSurfaceClasses = canvasTheme === 'dark'
    ? 'bg-[#071318] border-[#163848]'
    : 'bg-[#FCFCFD] border-slate-200';
  const canvasGridClasses = canvasTheme === 'dark'
    ? 'bg-[radial-gradient(#1b4353_1.2px,transparent_1.2px)]'
    : 'bg-[radial-gradient(#e2e8f0_1.2px,transparent_1.2px)]';

  return (
    <div className="h-full flex flex-col min-h-0 overflow-hidden px-5 sm:px-6 py-4 pb-4 space-y-2 font-sans bg-[#F8FAFC]">
      {/* Consolidated Workflow Navigation & Controls Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 text-slate-800 shadow-2xs space-y-3 shrink-0" id="workflow-studio-header">
        {/* Middle: Back button, Title & Status, Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-[260px]">
            {/* Back Button */}
            <button
              type="button"
              onClick={() => onSelectWorkflow && onSelectWorkflow(null as any)}
              className="w-8 h-8 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 flex items-center justify-center transition cursor-pointer shadow-2xs"
              title="Back to Workflows"
            >
              <ChevronLeft size={16} />
            </button>

            {/* Editable Workflow Title */}
            <input
              type="text"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              placeholder="New Validation Pipeline..."
              className="text-base sm:text-lg font-bold text-slate-900 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-200 focus:border-[#F27421] flex-wrap rounded-xl px-2.5 py-1 focus:outline-none transition min-w-[180px] max-w-sm flex-1 font-sans"
              title="Click to rename workflow"
            />

            {/* Live Status Badge */}
            <AssetStatusBadge
              status={(activeWorkflow as any)?.status || 'DRAFT'}
              isLocked={Boolean((activeWorkflow as any)?.is_locked)}
              approvedByName={(activeWorkflow as any)?.approved_by_user_name}
            />
          </div>

          {/* Actions: Save, Share & Delete */}
          <div className="flex items-center gap-2 shrink-0">
            {hasUnsavedChanges && (
              <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1.5 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                <span>Unsaved</span>
              </span>
            )}

            {activeWorkflow && (
              <button
                type="button"
                onClick={() => setShowShareModal(true)}
                className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition"
                title={`Share workflow "${activeWorkflow.name}"`}
              >
                <Share2 size={13} className="text-slate-500" />
                <span>Share</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSaveWorkflow()}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition disabled:opacity-50 bg-[#F27421] hover:bg-[#e06516] text-white"
            >
              <Save size={13} />
              <span>{isSaving ? 'Saving...' : 'Save flowchart'}</span>
            </button>

            {activeWorkflow && (
              <button
                type="button"
                onClick={handleDeleteWorkflow}
                className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-xl transition cursor-pointer"
                title={`Delete workflow "${activeWorkflow.name}"`}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Bottom Row: Badges (Category, DB/Table, hashtag, rules accepted) */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
          {/* Category Selector Pill */}
          <select
            value={workflowCategory}
            onChange={(e: any) => setWorkflowCategory(e.target.value)}
            className="text-xs font-medium bg-slate-100 hover:bg-slate-200/60 border border-slate-200 rounded-full px-3 py-1 text-slate-700 focus:outline-none focus:border-[#F27421] cursor-pointer shadow-2xs"
            title="Workflow Business Category"
          >
            <option value="Settlement">Settlement</option>
            <option value="Reconciliation">Reconciliation</option>
            <option value="Compliance">Compliance</option>
            <option value="Fulfillment">Fulfillment</option>
            <option value="Custom">Custom</option>
          </select>

          {/* Target Database & Scope Table Target Selection */}
          <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 rounded-full px-3 py-1 text-xs text-slate-700 shadow-2xs">
            <Database size={13} className="text-slate-500 shrink-0" />
            <select
              value={workflowDbId}
              onChange={(e) => {
                const newDbId = e.target.value;
                setWorkflowDbId(newDbId);
                const db = databases.find(d => String(d.id) === String(newDbId));
                const tbls: string[] = db?.availableTables || db?.allowedTables || (db?.metadata?.tables) || [];
                if (tbls.length > 0 && (!workflowTable || !tbls.includes(workflowTable))) {
                  setWorkflowTable(tbls[0]);
                } else if (!newDbId) {
                  setWorkflowTable('');
                }
              }}
              className="bg-transparent border-none text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer max-w-[130px] truncate"
              title="Target Database Connection"
            >
              <option value="">(No Target DB)</option>
              {databases.map(db => (
                <option key={db.id} value={db.id}>{db.name || db.database || db.id}</option>
              ))}
            </select>

            {workflowDbId && (
              <>
                <span className="text-slate-400">/</span>
                <select
                  value={workflowTable}
                  onChange={(e) => setWorkflowTable(e.target.value)}
                  className="bg-transparent border-none text-xs font-medium text-slate-800 focus:outline-none cursor-pointer max-w-[120px] truncate font-mono"
                  title="Scope Table"
                >
                  <option value="">(All Tables)</option>
                  {(() => {
                    const db = databases.find(d => String(d.id) === String(workflowDbId));
                    const tbls: string[] = db?.availableTables || db?.allowedTables || (db?.metadata?.tables) || [];
                    return tbls.map((tbl: string) => (
                      <option key={tbl} value={tbl}>{tbl}</option>
                    ));
                  })()}
                </select>
              </>
            )}
          </div>

          {/* Scoped Team Tag */}
          <span className="text-xs font-mono font-medium text-slate-700 bg-slate-100 px-3 py-1 rounded-full border border-slate-200 whitespace-nowrap shadow-2xs">
            #{activeWorkflow?.teamId || currentUser?.teamId || 'team-cards'}
          </span>

          {/* Workflow DB Column Rules Acceptance Button */}
          <button
            type="button"
            onClick={() => {
              setSelectedNode(null);
              setSelectedConnection(null);
              setRightPanelCollapsed(false);
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition cursor-pointer border shadow-2xs ${workflowAttachedDbConfigIds.length > 0
              ? 'bg-orange-50 border-orange-200 text-[#F27421] hover:bg-orange-100'
              : 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
            title="Open Workflow DB Column Configuration Acceptance Panel"
          >
            <ShieldCheck size={13} className={workflowAttachedDbConfigIds.length > 0 ? 'text-[#F27421]' : 'text-slate-500'} />
            <span>{workflowAttachedDbConfigIds.length} DB rules accepted</span>
          </button>
        </div>

        {saveSuccessMsg && (
          <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
            <span>{saveSuccessMsg}</span>
          </div>
        )}
      </div>

      {/* Main Studio Area: 3-Pane Power-User Architecture */}
      <div className="flex-1 min-h-0 flex flex-col xl:flex-row gap-0 bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs items-stretch">
        {!leftPanelCollapsed && (
          <div className="shrink-0 h-full flex flex-col min-h-0">
            <WorkflowPalette
              workflows={workflows}
              activeWorkflow={activeWorkflow}
              onSelectWorkflow={(wf) => selectWorkflow(wf)}
              onNewWorkflow={handleNewWorkflow}
              validationBoxes={validationBoxes}
              onAddTerminalNode={handleAddTerminalNode}
              onAddBoxNode={handleAddBoxNode}
              onApplyTemplate={handleApplyTemplate}
              onOpenAggregators={() => {
                setShowAggregatorModal(true);
                resetRuleForm(aggregatorTab);
              }}
              aggregationsCount={messageAggregations.length}
            />
          </div>
        )}

        {/* Center: Interactive Vertical Flowchart Canvas */}
        <div className={`relative flex-1 w-full h-full min-h-0 bg-[#FCFCFD] flex flex-col min-w-0 ${!rightPanelCollapsed ? 'border-r border-slate-200' : ''}`}>
          {/* Top Floating / Pre-Flight Topology and Toolbar Row */}
          <div className="bg-white/80 backdrop-blur-md px-4 py-2.5 border-b border-slate-200 flex items-center justify-between text-xs text-slate-700 shrink-0 z-20">
            {/* Left: Pre-Flight Validation Status Badge */}
            <WorkflowValidationSummary nodes={nodes} connections={connections} />

            {/* Right: View Mode Toggle, Auto-align, Zoom, Actions */}
            <div className="flex items-center gap-2">
              {/* View Mode Toggle: Canvas vs Stages */}
              <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-100 p-0.5 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setWorkflowViewMode('DAG')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${workflowViewMode === 'DAG'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                  Canvas
                </button>
                <button
                  type="button"
                  onClick={() => setWorkflowViewMode('LIST')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${workflowViewMode === 'LIST'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                  Stages
                </button>
              </div>

              {/* Auto-Align Button */}
              <button
                type="button"
                onClick={handleAutoAlignVertical}
                className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                title="Auto-align all nodes vertically into a straight layout"
              >
                <Move size={13} />
                <span>Auto-align</span>
              </button>

              {/* Zoom Controls Pill */}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs shadow-2xs">
                <button
                  type="button"
                  onClick={() => setCanvasZoom(z => Math.max(0.4, Number((z - 0.1).toFixed(1))))}
                  className="hover:text-slate-900 px-1 font-bold text-xs cursor-pointer"
                  title="Zoom Out"
                >
                  -
                </button>
                <span className="font-mono font-semibold px-1 text-[11px]">{Math.round(canvasZoom * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setCanvasZoom(z => Math.min(2, Number((z + 0.1).toFixed(1))))}
                  className="hover:text-slate-900 px-1 font-bold text-xs cursor-pointer"
                  title="Zoom In"
                >
                  +
                </button>
              </div>

              {/* Add Block button */}
              <button
                type="button"
                onClick={handleCreateNewFlowchart}
                className="w-8 h-8 rounded-xl bg-white border border-slate-200 hover:border-[#F27421] text-slate-600 hover:text-[#F27421] flex items-center justify-center transition cursor-pointer shadow-2xs"
                title="Add New Flowchart Block"
              >
                <Plus size={15} />
              </button>

              {/* Extend Canvas Height */}
              <button
                type="button"
                onClick={() => setExtraCanvasHeight(h => h + 600)}
                className="w-8 h-8 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-slate-900 flex items-center justify-center transition cursor-pointer shadow-2xs"
                title="Extend Canvas Height (+600px)"
              >
                <Maximize2 size={13} />
              </button>

              {/* Left Panel Toggle */}
              <button
                type="button"
                onClick={() => setLeftPanelCollapsed(v => !v)}
                className={`w-8 h-8 rounded-xl border flex items-center justify-center transition cursor-pointer shadow-2xs ${leftPanelCollapsed
                  ? 'bg-white border-slate-200 text-slate-400 hover:text-slate-700'
                  : 'bg-orange-50 border-orange-200 text-[#F27421]'
                  }`}
                title={leftPanelCollapsed ? 'Show Flow Catalog' : 'Hide Flow Catalog'}
              >
                <Eye size={13} />
              </button>

              {/* Right Panel Toggle */}
              <button
                type="button"
                onClick={() => setRightPanelCollapsed(v => !v)}
                className={`w-8 h-8 rounded-xl border flex items-center justify-center transition cursor-pointer shadow-2xs ${rightPanelCollapsed
                  ? 'bg-white border-slate-200 text-slate-400 hover:text-slate-700'
                  : 'bg-orange-50 border-orange-200 text-[#F27421]'
                  }`}
                title={rightPanelCollapsed ? 'Show Inspector' : 'Hide Inspector'}
              >
                <SlidersHorizontal size={13} />
              </button>
            </div>
          </div>

          {workflowViewMode === 'LIST' ? (
            <WorkflowStagesView
              workflowName={workflowName || activeWorkflow?.name || 'New Validation Pipeline'}
              onSave={handleSaveWorkflow}
            />
          ) : (
            <div
              ref={canvasRef}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              className="relative flex-1 bg-[#FCFCFD] bg-[radial-gradient(#e2e8f0_1.2px,transparent_1.2px)] [background-size:24px_24px] select-none overflow-auto p-6"
              style={{ minHeight: '600px' }}
            >
              {/* Inner Sizing Wrapper: explicitly dictates scrollable width/height so scrolling is limitless */}
              <div
                style={{
                  width: `${canvasDimensions.width}px`,
                  height: `${canvasDimensions.height}px`,
                  position: 'relative'
                }}
              >
                {/* SVG Wire Lines Layer for Vertical Bezier Curves */}
                <svg
                  className="absolute inset-0 pointer-events-none z-0 overflow-visible"
                  style={{ width: `${canvasDimensions.width}px`, height: `${canvasDimensions.height}px` }}
                >
                  <defs>
                    <marker id="arrow-navy" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#0F142A" />
                    </marker>
                    <marker id="arrow-emerald" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
                    </marker>
                    <marker id="arrow-rose" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#f43f5e" />
                    </marker>
                    <marker id="arrow-purple" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#a855f7" />
                    </marker>
                  </defs>

                  {/* Render Existing Vertical Connections */}
                  {connections.map(conn => {
                    const fromPoint = getNodeCenter(conn.fromNodeId, conn.fromPort);
                    const toPoint = getNodeCenter(conn.toNodeId, 'input');

                    // Vertical Bezier curve: smoothly curves downwards from fromPoint to toPoint
                    const dy = Math.max(50, Math.abs(toPoint.y - fromPoint.y) * 0.5);
                    const path = `M ${fromPoint.x} ${fromPoint.y} C ${fromPoint.x} ${fromPoint.y + dy}, ${toPoint.x} ${toPoint.y - dy}, ${toPoint.x} ${toPoint.y}`;

                    const midX = (fromPoint.x + toPoint.x) / 2;
                    const midY = (fromPoint.y + toPoint.y) / 2;

                    const isPass = conn.fromPort === 'pass';
                    const isFail = conn.fromPort === 'fail' || conn.action === 'STOP';
                    const isReport = conn.action === 'REPORT';

                    const strokeColor = isReport ? '#a855f7' : isFail ? '#f43f5e' : isPass ? '#10b981' : '#0F142A';
                    const markerId = isReport ? 'url(#arrow-purple)' : isFail ? 'url(#arrow-rose)' : isPass ? 'url(#arrow-emerald)' : 'url(#arrow-navy)';

                    return (
                      <g key={conn.id} className="pointer-events-auto cursor-pointer group" onClick={() => {
                        setSelectedConnection(conn);
                        setSelectedNode(null);
                        setRightPanelCollapsed(false);
                      }}>
                        {/* Background hit area for easier clicking */}
                        <path
                          d={path}
                          fill="none"
                          stroke="transparent"
                          strokeWidth="18"
                        />
                        {/* Visible Vertical Wire Line */}
                        <path
                          d={path}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth="2.5"
                          strokeDasharray={isFail ? '6 4' : 'none'}
                          markerEnd={markerId}
                          className="group-hover:stroke-[#F27421] transition"
                        />
                        {/* Action badge on wire */}
                        <foreignObject x={midX - 44} y={midY - 14} width="88" height="28">
                          <div className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold font-sans text-center shadow-xs border truncate ${isReport ? 'bg-purple-50 text-purple-700 border-purple-200' :
                            isFail ? 'bg-rose-50 text-rose-700 border-rose-300' :
                              isPass ? 'bg-emerald-50 text-emerald-700 border-emerald-300' :
                                'bg-slate-100 text-slate-700 border-slate-300'
                            }`}>
                            {conn.label || (isPass ? 'Pass' : isFail ? 'Fail' : conn.action)}
                          </div>
                        </foreignObject>
                      </g>
                    );
                  })}

                  {/* In-Progress Drawn Wire (Vertical flow) */}
                  {wireSource && (
                    <path
                      d={`M ${wireSource.startX} ${wireSource.startY} C ${wireSource.startX} ${wireSource.startY + 50}, ${mousePos.x} ${mousePos.y - 50}, ${mousePos.x} ${mousePos.y}`}
                      fill="none"
                      stroke={wireSource.port === 'pass' ? '#10b981' : wireSource.port === 'fail' ? '#f43f5e' : '#0F142A'}
                      strokeWidth="2.5"
                      strokeDasharray={wireSource.port === 'fail' ? '6 4' : 'none'}
                      markerEnd={wireSource.port === 'pass' ? 'url(#arrow-emerald)' : wireSource.port === 'fail' ? 'url(#arrow-rose)' : 'url(#arrow-navy)'}
                    />
                  )}
                </svg>

                {nodes.length === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-auto">
                    <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md text-center shadow-xl backdrop-blur-xs">
                      <div className="w-12 h-12 rounded-xl bg-orange-50 text-[#F27421] border border-orange-200 flex items-center justify-center mx-auto mb-3 shadow-2xs">
                        <GitFork size={24} />
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 mb-1">No Flowchart Pipeline Configured</h3>
                      <p className="text-xs text-slate-500 mb-5">
                        There are no active flowchart workflows. Create a new pipeline or drag blocks from the left catalog to begin.
                      </p>
                      <button
                        type="button"
                        onClick={handleCreateNewFlowchart}
                        className="px-4 py-2 bg-[#F27421] hover:bg-[#e06516] text-white text-xs font-bold rounded-xl shadow-sm transition inline-flex items-center gap-2 cursor-pointer"
                      >
                        <Plus size={14} />
                        <span>Create New Flowchart Pipeline</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Draggable Vertical Node Components */}
                {nodes.map(node => {
                  const isStart = node.type === 'START';
                  const isEnd = node.type === 'END';
                  const hasReportColumn = Boolean(node.reportColumnName);

                  // 1. START TERMINAL NODE: Dark navy stadium pill with orange play icon
                  if (isStart) {
                    return (
                      <div
                        key={node.id}
                        style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
                        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                        className="absolute w-[240px] h-[52px] rounded-full select-none z-10 transition-shadow shadow-lg flex items-center justify-between px-4 border border-slate-800 cursor-grab active:cursor-grabbing bg-[#0F142A] text-white"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-6 h-6 rounded-full bg-[#F27421] text-white flex items-center justify-center shrink-0 shadow-xs">
                            <Play size={12} className="fill-white ml-0.5" />
                          </div>
                          <h4 className="font-bold text-xs tracking-wider uppercase text-white truncate">
                            {node.name || 'START'}
                          </h4>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteNode(node.id);
                          }}
                          className="p-1 hover:bg-white/10 rounded-full text-slate-400 hover:text-rose-400 transition cursor-pointer"
                          title="Remove Start"
                        >
                          <Trash2 size={13} />
                        </button>

                        {/* Bottom Output Port Pill */}
                        <div
                          title="Drag downwards to connect start of pipeline"
                          onMouseDown={(e) => handleStartWire(e, node.id, 'output')}
                          className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-[#F27421] text-[9px] font-mono font-semibold flex items-center gap-1 shadow-md cursor-crosshair transition z-20 group"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-[#F27421]"></div>
                          <span>Continue</span>
                        </div>
                      </div>
                    );
                  }

                  // 2. END TERMINAL NODES: White stadium pill with green or red border
                  if (isEnd) {
                    const isFailed = node.name.toLowerCase().includes('not') ||
                      node.name.toLowerCase().includes('fail') ||
                      node.name.toLowerCase().includes('stop') ||
                      node.name.toLowerCase().includes('reject');
                    const isReconciled = !isFailed;
                    return (
                      <div
                        key={node.id}
                        style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
                        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                        className={`absolute w-[240px] h-[50px] rounded-full select-none z-10 transition-shadow shadow-md flex items-center justify-between px-4 border-2 cursor-grab active:cursor-grabbing bg-white ${isReconciled ? 'border-emerald-500 text-emerald-800' : 'border-rose-500 text-rose-800'
                          }`}
                      >
                        {/* Top Input Port */}
                        <div
                          title="Input Port (Drop wire here)"
                          onMouseUp={(e) => handleCompleteWire(e, node.id)}
                          className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white border-2 border-slate-400 hover:border-[#F27421] hover:scale-125 flex items-center justify-center transition cursor-pointer z-20 shadow-xs"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-600"></div>
                        </div>

                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${isReconciled ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                            }`}>
                            {isReconciled ? '✓' : '✕'}
                          </div>
                          <h4 className="font-bold text-xs truncate">
                            {node.name}
                          </h4>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteNode(node.id);
                          }}
                          className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-rose-600 transition cursor-pointer"
                          title="Remove Terminal"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    );
                  }

                  // 3. PROCESS / CONDITION / RECONCILIATION / REPORT BOX (Structured Card matching 03_workflow_studio.png)
                  const isSelected = selectedNode?.id === node.id;
                  const boxTypeLabel = node.boxType === 'INGESTION_SEARCH'
                    ? 'Search & Ingest'
                    : node.boxType === 'RECONCILIATION'
                      ? 'Reconciliation'
                      : node.boxType === 'REPORT'
                        ? 'Report'
                        : 'Condition check';

                  return (
                    <div
                      key={node.id}
                      style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
                      onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                      onClick={() => {
                        setSelectedNode(node);
                        setSelectedConnection(null);
                        setRightPanelCollapsed(false);
                      }}
                      className={`absolute w-[280px] rounded-2xl select-none z-10 bg-white transition-all shadow-lg p-4 text-slate-800 flex flex-col justify-between cursor-grab active:cursor-grabbing group ${isSelected ? 'border-2 border-[#F27421] ring-2 ring-[#F27421]/20 shadow-xl' : 'border-2 border-[#F27421] hover:shadow-xl'
                        }`}
                    >
                      {/* Top Input Port */}
                      <div
                        title="Input Port (Drop wire here)"
                        onMouseUp={(e) => handleCompleteWire(e, node.id)}
                        className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white border-2 border-slate-400 hover:border-[#F27421] hover:scale-125 flex items-center justify-center transition cursor-pointer z-20 shadow-xs"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-600"></div>
                      </div>

                      {/* Header with pill and actions */}
                      <div className="flex items-center justify-between">
                        <span className="bg-orange-50 text-[#F27421] border border-orange-200 text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 shadow-2xs">
                          <span>@</span>
                          <span>{boxTypeLabel}</span>
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedNode(node);
                              setSelectedConnection(null);
                              setRightPanelCollapsed(false);
                            }}
                            className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-800 transition cursor-pointer"
                            title="Configure Block"
                          >
                            <Sliders size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteNode(node.id);
                            }}
                            className="p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 transition cursor-pointer"
                            title="Remove Block"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Body */}
                      <div className="mt-2.5 space-y-1.5">
                        <h3 className="font-bold text-slate-900 text-sm tracking-tight truncate">
                          {node.name}
                        </h3>
                        <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                          {node.description || (node.targetTable ? `Validate records against ${node.targetTable}` : 'Condition verification step')}
                        </p>

                        {/* Tag badges row */}
                        <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                          {node.targetTable && (
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-[10px] font-mono font-medium border border-slate-200">
                              {node.targetTable}
                            </span>
                          )}
                          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-[10px] font-mono font-medium border border-slate-200">
                            {workflowCategory || 'Sett'}
                          </span>
                          {Boolean(node.attachedDbConfigIds?.length || node.columnConfigurationIds?.length || node.columnConfigurations?.length) && (
                            <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md text-[10px] font-mono font-medium border border-emerald-200">
                              {node.attachedDbConfigIds?.length || node.columnConfigurationIds?.length || node.columnConfigurations?.length} Table Rules
                            </span>
                          )}
                        </div>

                        {hasReportColumn && (
                          <div className="p-1 bg-purple-50 border border-purple-200 rounded flex items-center justify-between gap-1 text-[9px]">
                            <span className="text-purple-700 font-bold truncate flex items-center gap-1 font-mono">
                              <FileSpreadsheet size={10} className="text-purple-600" />
                              <span>Col: "{node.reportColumnName}"</span>
                            </span>
                            <span className="px-1 py-0.2 rounded bg-purple-600 text-white font-mono text-[8px] font-bold">
                              GRID
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Bottom Egress Ports: Pass and Fail */}
                      <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-3 text-[10px]">
                        {/* Left: PASS port pill */}
                        <div className="relative">
                          <button
                            type="button"
                            title="Drag downwards on PASS"
                            onMouseDown={(e) => handleStartWire(e, node.id, 'pass')}
                            className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 flex items-center gap-1 font-bold cursor-crosshair transition shadow-2xs"
                          >
                            <span>✓</span>
                            <span>Pass</span>
                          </button>
                          <div
                            onMouseDown={(e) => handleStartWire(e, node.id, 'pass')}
                            className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-emerald-500 flex items-center justify-center cursor-crosshair hover:scale-125 transition shadow-xs"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-600"></div>
                          </div>
                        </div>

                        {/* Right: FAIL port pill */}
                        <div className="relative">
                          <button
                            type="button"
                            title="Drag downwards on FAIL"
                            onMouseDown={(e) => handleStartWire(e, node.id, 'fail')}
                            className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-300 hover:bg-rose-100 flex items-center gap-1 font-bold cursor-crosshair transition shadow-2xs"
                          >
                            <span>✕</span>
                            <span>Fail</span>
                          </button>
                          <div
                            onMouseDown={(e) => handleStartWire(e, node.id, 'fail')}
                            className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-rose-500 flex items-center justify-center cursor-crosshair hover:scale-125 transition shadow-xs"
                          >
                            <div className="w-1.5 h-1.5 rounded-full bg-rose-600"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {!rightPanelCollapsed && (
          <div className="shrink-0 h-full flex flex-col min-h-0">
            <WorkflowInspector
              selectedNode={selectedNode}
              onUpdateNode={(updated) => {
                setNodes(prev => prev.map(n => n.id === updated.id ? updated : n));
                setSelectedNode(updated);
              }}
              onDeleteNode={handleDeleteNode}
              onCloseNode={() => {
                setSelectedNode(null);
                setRightPanelCollapsed(true);
              }}
              selectedConnection={selectedConnection}
              onUpdateConnection={(updated) => {
                setConnections(prev => prev.map(c => c.id === updated.id ? updated : c));
                if (updated.fromPort === 'fail') {
                  setNodes(prev => prev.map(n => n.id === updated.fromNodeId ? { ...n, onFailAction: updated.action } : n));
                } else if (updated.fromPort === 'pass') {
                  setNodes(prev => prev.map(n => n.id === updated.fromNodeId ? { ...n, onPassAction: updated.action } : n));
                }
                setSelectedConnection(updated);
              }}
              onDeleteConnection={handleDeleteConnection}
              onCloseConnection={() => {
                setSelectedConnection(null);
                setRightPanelCollapsed(true);
              }}
              validationBoxes={validationBoxes}
              databases={databases}
              defaultWorkflowDbId={workflowDbId}
              defaultWorkflowTable={workflowTable}
              workflowName={workflowName}
              workflowCategory={workflowCategory}
              workflowDescription={workflowDescription}
              workflowDbId={workflowDbId}
              workflowTable={workflowTable}
              workflowAttachedDbConfigIds={workflowAttachedDbConfigIds}
              onUpdateWorkflowDbConfig={({ targetDbId, targetTable, attachedDbConfigIds }) => {
                if (targetDbId !== undefined) {
                  setWorkflowDbId(targetDbId);
                }
                if (targetTable !== undefined) {
                  setWorkflowTable(targetTable);
                }
                if (attachedDbConfigIds !== undefined) {
                  setWorkflowAttachedDbConfigIds(attachedDbConfigIds);
                }
              }}
              onCloseInspector={() => setRightPanelCollapsed(true)}
            />
          </div>
        )}
      </div>

      {/* Workflow Message Aggregator Modal */}
      {showAggregatorModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden text-slate-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                  <SlidersHorizontal size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">Workflow Message Aggregator</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-purple-950 text-purple-300 border border-purple-800">
                      {workflowName || activeWorkflow?.name || 'Selected Workflow'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Define consolidated Pass and Fail status messages triggered by one or more validation blocks in this workflow.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAggregatorModal(false);
                  setIsEditingRule(false);
                }}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Feedback toast if any */}
              {aggregatorFeedback && (
                <div className="px-3.5 py-2 rounded-lg bg-indigo-950 border border-indigo-700 text-indigo-200 text-xs flex items-center gap-2">
                  <Sparkles size={14} className="text-indigo-400 shrink-0" />
                  <span>{aggregatorFeedback}</span>
                </div>
              )}

              {/* PASS / FAIL Toggle Tabs */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAggregatorTab('FAIL');
                      resetRuleForm('FAIL');
                    }}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer ${aggregatorTab === 'FAIL'
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-950'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                  >
                    <AlertTriangle size={13} />
                    <span>FAIL Aggregations</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${aggregatorTab === 'FAIL' ? 'bg-rose-800 text-white' : 'bg-slate-800 text-slate-400'
                      }`}>
                      {messageAggregations.filter(r => r.type === 'FAIL').length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAggregatorTab('PASS');
                      resetRuleForm('PASS');
                    }}
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer ${aggregatorTab === 'PASS'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                      }`}
                  >
                    <CheckCircle2 size={13} />
                    <span>PASS Aggregations</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${aggregatorTab === 'PASS' ? 'bg-emerald-800 text-white' : 'bg-slate-800 text-slate-400'
                      }`}>
                      {messageAggregations.filter(r => r.type === 'PASS').length}
                    </span>
                  </button>
                </div>

                {!isEditingRule && (
                  <button
                    type="button"
                    onClick={() => handleStartNewRule(aggregatorTab)}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow transition"
                  >
                    <Plus size={13} />
                    <span>Add {aggregatorTab} Message</span>
                  </button>
                )}
              </div>

              {/* Active Tab Explanation */}
              <div className="text-xs text-slate-400 bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
                {aggregatorTab === 'FAIL' ? (
                  <div className="flex items-center gap-2 text-rose-300">
                    <AlertCircle size={14} className="shrink-0 text-rose-400" />
                    <span>
                      When any or all attached validation blocks fail for a record, the Investigation Panel will display this aggregated failure message instead of separate columns.
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-emerald-300">
                    <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
                    <span>
                      When attached validation blocks pass successfully, the Investigation Panel will display this aggregated success message in the unified outcome column.
                    </span>
                  </div>
                )}
              </div>

              {/* Rule Editor Form (when adding or editing) */}
              {isEditingRule ? (
                <div className="bg-slate-950/90 border border-slate-700/80 rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${aggregatorTab === 'FAIL' ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                      <span>{editingRuleId ? 'Edit Aggregation Rule' : `New ${aggregatorTab} Aggregation Rule`}</span>
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      Step {editingRuleId ? 'Update' : '1 of 1'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">
                        Rule Name / Label: <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={formRuleName}
                        onChange={(e) => setFormRuleName(e.target.value)}
                        placeholder="e.g. Core Settlement & Terminal Discrepancy"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">
                        Trigger Condition:
                      </label>
                      <select
                        value={formRuleOperator}
                        onChange={(e: any) => setFormRuleOperator(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500 text-xs"
                      >
                        {aggregatorTab === 'FAIL' ? (
                          <>
                            <option value="ANY">Trigger if ANY attached block FAILS (Default)</option>
                            <option value="ALL">Trigger only if ALL attached blocks FAIL</option>
                          </>
                        ) : (
                          <>
                            <option value="ALL">Trigger only if ALL attached blocks PASS (Default)</option>
                            <option value="ANY">Trigger if ANY attached block PASSES</option>
                          </>
                        )}
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">
                        Consolidated Status Message (Shown in Investigation Column): <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        value={formRuleMessage}
                        onChange={(e) => setFormRuleMessage(e.target.value)}
                        placeholder={aggregatorTab === 'FAIL' ? 'e.g. Terminal auth mismatch with core settlement record' : 'e.g. Core settlement and interchange verified'}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500 text-xs font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">
                        Severity / Badge Appearance:
                      </label>
                      <select
                        value={formRuleSeverity}
                        onChange={(e: any) => setFormRuleSeverity(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500 text-xs"
                      >
                        {aggregatorTab === 'FAIL' ? (
                          <>
                            <option value="CRITICAL">Critical (Red badge)</option>
                            <option value="WARNING">Warning (Amber badge)</option>
                          </>
                        ) : (
                          <>
                            <option value="RECONCILED">Reconciled (Emerald badge)</option>
                            <option value="WARNING">Warning / Partial Pass (Amber badge)</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Validation Blocks Selection - STRICTLY SELECTED WORKFLOW */}
                  <div className="pt-2 border-t border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[11px] font-mono text-slate-400">
                        Attach Validation Blocks from this Workflow ({formSelectedStepIds.length} of {workflowValidationBlocks.length} selected):
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setFormSelectedStepIds(workflowValidationBlocks.filter(b => b && b.id).map(b => b.id))}
                          className="text-[10px] text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                        >
                          Select All
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormSelectedStepIds([])}
                          className="text-[10px] text-slate-400 hover:text-slate-300 underline cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {workflowValidationBlocks.length === 0 ? (
                      <div className="text-center py-6 bg-slate-900/50 rounded-lg border border-dashed border-slate-800 text-slate-400 text-xs">
                        No validation blocks are present on the flowchart canvas. Please drag or add validation blocks to the workflow first.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                        {workflowValidationBlocks.filter(b => b && b.id).map(block => {
                          const isSelected = formSelectedStepIds.includes(block.id);
                          return (
                            <div
                              key={block.id}
                              onClick={() => {
                                if (isSelected) {
                                  setFormSelectedStepIds(prev => prev.filter(id => id !== block.id));
                                } else {
                                  setFormSelectedStepIds(prev => [...prev, block.id]);
                                }
                              }}
                              className={`p-2.5 rounded-lg border text-xs cursor-pointer transition flex items-start gap-2.5 ${isSelected
                                ? 'bg-indigo-950/60 border-indigo-500 text-white'
                                : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                                }`}
                            >
                              <div className="mt-0.5 shrink-0">
                                {isSelected ? (
                                  <CheckSquare size={14} className="text-indigo-400" />
                                ) : (
                                  <Square size={14} className="text-slate-600" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-bold text-slate-200 truncate text-[11px]">
                                    {block.name}
                                  </span>
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-slate-800 text-slate-300 shrink-0">
                                    {block.category}
                                  </span>
                                </div>
                                {block.description && (
                                  <p className="text-[10px] text-slate-500 truncate mt-0.5">
                                    {block.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Form Buttons */}
                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => resetRuleForm(aggregatorTab)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveRule}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold cursor-pointer transition shadow"
                    >
                      {editingRuleId ? 'Update Aggregation' : 'Add Aggregation'}
                    </button>
                  </div>
                </div>
              ) : null}

              {/* List of Existing Aggregation Rules for Active Tab */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span>Configured {aggregatorTab} Rules:</span>
                  <span>{messageAggregations.filter(r => r.type === aggregatorTab).length} Rule(s)</span>
                </div>

                {messageAggregations.filter(r => r.type === aggregatorTab).length === 0 ? (
                  <div className="text-center py-8 bg-slate-950/30 rounded-xl border border-dashed border-slate-800 text-slate-500 text-xs space-y-2">
                    <SlidersHorizontal size={24} className="mx-auto text-slate-600" />
                    <div>No {aggregatorTab} message aggregations configured for this workflow yet.</div>
                    <button
                      type="button"
                      onClick={() => handleStartNewRule(aggregatorTab)}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs font-semibold inline-flex items-center gap-1 cursor-pointer transition"
                    >
                      <Plus size={12} />
                      <span>Create First {aggregatorTab} Rule</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {(Array.isArray(messageAggregations) ? messageAggregations : [])
                      .filter(r => r && r.type === aggregatorTab)
                      .map((rule) => {
                        const attachedBlocks = workflowValidationBlocks.filter(b => b && (
                          (rule.validationStepIds && Array.isArray(rule.validationStepIds) && rule.validationStepIds.includes(b.id)) ||
                          (rule.validationStepIds && Array.isArray(rule.validationStepIds) && rule.validationStepIds.includes(b.nodeId))
                        ));
                        return (
                          <div
                            key={rule.id}
                            className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition flex flex-col md:flex-row md:items-center justify-between gap-3"
                          >
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-white text-xs">
                                  {rule.name}
                                </span>
                                <span className={`px-2 py-0.2 rounded-full text-[9px] font-bold font-mono ${rule.type === 'FAIL'
                                  ? rule.severity === 'CRITICAL' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  }`}>
                                  {rule.severity || (rule.type === 'FAIL' ? 'CRITICAL' : 'RECONCILED')}
                                </span>
                                <span className="px-2 py-0.2 rounded text-[9px] font-mono bg-slate-900 text-slate-400 border border-slate-800">
                                  Operator: {rule.operator || (rule.type === 'FAIL' ? 'ANY' : 'ALL')}
                                </span>
                              </div>

                              <div className="text-xs text-indigo-300 font-medium bg-slate-900/80 px-2.5 py-1 rounded border border-slate-800/80">
                                "{rule.message}"
                              </div>

                              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                <span className="text-[10px] text-slate-500 font-mono">Attached Blocks:</span>
                                {attachedBlocks.length > 0 ? (
                                  attachedBlocks.map(b => (
                                    <span
                                      key={b.id}
                                      className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-slate-900 text-slate-300 border border-slate-800"
                                    >
                                      {b.name}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-[10px] text-amber-400 font-mono">
                                    {rule.validationStepIds?.length || 0} block(s) (IDs: {rule.validationStepIds?.join(', ')})
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
                              <button
                                type="button"
                                onClick={() => handleEditRule(rule)}
                                className="p-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-xs cursor-pointer transition"
                                title="Edit Aggregation Rule"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteRule(rule.id)}
                                className="p-1.5 bg-slate-900 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-700 text-slate-400 hover:text-rose-400 rounded-lg text-xs cursor-pointer transition"
                                title="Delete Aggregation Rule"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-800 flex items-center justify-between bg-slate-950/80">
              <div className="text-xs text-slate-400">
                <span className="font-bold text-white">{messageAggregations.length}</span> total aggregation rule(s) configured.
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAggregatorModal(false);
                    setIsEditingRule(false);
                  }}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold cursor-pointer transition"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleSaveAndApplyAggregations}
                  disabled={isSaving}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md transition disabled:opacity-50"
                >
                  <Save size={13} />
                  <span>{isSaving ? 'Saving...' : 'Save & Attach to Workflow'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Visual Operational Asset Share Modal */}
      {activeWorkflow && (
        <ShareAssetModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          assetType="WORKFLOW"
          assetId={activeWorkflow.id}
          assetTitle={workflowName || activeWorkflow.name}
          assetDescription={workflowDescription || activeWorkflow.description}
          previewDetails={{
            category: workflowCategory || activeWorkflow.category,
            stepCount: nodes.length
          }}
          currentUser={currentUser}
          onShareSuccess={() => {
            setSaveSuccessMsg('Workflow successfully shared!');
            setTimeout(() => setSaveSuccessMsg(''), 4000);
          }}
        />
      )}
    </div>
  );
};

export default WorkflowStudioFlowchart;
