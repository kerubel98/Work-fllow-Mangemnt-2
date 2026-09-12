import React, { useState, useEffect, useRef } from 'react';
import {
  GitFork,
  Boxes,
  Database,
  CheckCircle2,
  AlertTriangle,
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
  AlertCircle,
  SlidersHorizontal
} from 'lucide-react';
import { api } from '../../api/client';
import { globalMappingService } from '../../services/globalMappingService';
import { showSystemAlert } from '../common/MessageModal';
import {
  ValidationBox,
  DatabaseValidationWorkflow,
  FlowchartNode,
  FlowchartConnection,
  FlowchartOutputAction,
  ProcessingStage,
  ValidationCheckStep,
  WorkflowMessageAggregationRule
} from '../../types';

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
  const [activeWorkflow, setActiveWorkflow] = useState<DatabaseValidationWorkflow | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState('');
  const [extraCanvasHeight, setExtraCanvasHeight] = useState<number>(600);
  
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

  // Workflow metadata
  const [workflowName, setWorkflowName] = useState('Payment Reconciliation Pipeline');
  const [workflowCategory, setWorkflowCategory] = useState<'Settlement' | 'Fulfillment' | 'Compliance' | 'Reconciliation' | 'Custom'>('Settlement');
  const [workflowDescription, setWorkflowDescription] = useState('Vertical flowchart pipeline connecting search blocks and conditional checks.');

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

  const canvasRef = useRef<HTMLDivElement>(null);

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
      const [wfs, boxes] = await Promise.all([
        api.getWorkflows(),
        api.getValidationBoxes()
      ]);
      const safeWfs = Array.isArray(wfs) ? wfs.filter(Boolean) : [];
      const safeBoxes = Array.isArray(boxes) ? boxes.filter(Boolean) : [];
      setWorkflows(safeWfs);
      setValidationBoxes(safeBoxes);

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
    const rawAggs = wf.messageAggregations;
    const safeAggs = Array.isArray(rawAggs)
      ? rawAggs.filter(Boolean)
      : (rawAggs && typeof rawAggs === 'object' ? Object.values(rawAggs).filter(Boolean) : []);
    setMessageAggregations(safeAggs as WorkflowMessageAggregationRule[]);

    if (wf.nodes && Array.isArray(wf.nodes) && wf.nodes.length > 0) {
      setNodes(wf.nodes.filter(Boolean));
      setConnections(Array.isArray(wf.connections) ? wf.connections.filter(Boolean) : []);
    } else {
      // Synthesize vertical flowchart nodes from existing stages & steps
      convertStagesToFlowchart(wf, boxesToUse);
    }
  };

  /**
   * Converts linear, stage-based or step-based workflow into a clean VERTICAL flowchart
   */
  const convertStagesToFlowchart = (wf: DatabaseValidationWorkflow, availableBoxes: ValidationBox[]) => {
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
        const box = safeBoxes.find(b => b && (b.id === (step as any)?.boxId || b.id === step?.id)) || stageBoxes[0] || (safeBoxes.length > 0 ? safeBoxes[sIdx % safeBoxes.length] : undefined);

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
          targetDbId: step?.targetDbId || box?.targetDbId || stage?.targetDbId,
          targetTable: step?.targetTable || box?.targetTable || stage?.targetDataSource
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
          targetDbId: box?.targetDbId || stage.targetDbId,
          targetTable: box?.targetTable || stage.targetDataSource
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
        targetTable: searchBox?.targetTable
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
        targetTable: checkBox?.targetTable
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
  };

  const handleDeleteConnection = (connId: string) => {
    setConnections(prev => prev.filter(c => c.id !== connId));
    if (selectedConnection?.id === connId) {
      setSelectedConnection(null);
    }
  };

  const handleDeleteNode = (nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setConnections(prev => prev.filter(c => c.fromNodeId !== nodeId && c.toNodeId !== nodeId));
    if (selectedNode?.id === nodeId) {
      setSelectedNode(null);
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
      targetDbId: box.targetDbId,
      targetTable: box.targetTable
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

      const stages: ProcessingStage[] = validationNodes.map((n, idx) => ({
        id: `stage-${n.id || idx + 1}`,
        name: String(n.name || `Stage ${idx + 1}`),
        description: String(n.description || ''),
        order: idx + 1,
        enabled: true,
        targetDbId: String(n.targetDbId || 'db-1'),
        targetDataSource: String(n.targetTable || 'transactions'),
        businessMeaning: String(n.category || 'Validation Stage'),
        ruleBlockIds: n.boxId ? [String(n.boxId)] : []
      }));

      const safeBoxes = (validationBoxes || []).filter(Boolean);

      const steps: ValidationCheckStep[] = validationNodes.map((n, idx) => {
        const box = safeBoxes.find(b => b && b.id === n.boxId);
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

        // Derive sourceField and targetField dynamically from the user's configuration
        // (searchParameters, requiredParams, dualSourceCondition, or explicit checkStep fields)
        // NEVER hardcode fallback to 'transaction_id'.
        const firstSearchParam = (box?.boxType === 'INGESTION_SEARCH' && Array.isArray(box.searchParameters) && box.searchParameters.length > 0)
          ? box.searchParameters[0]
          : null;
        const firstReqParam = (box?.checkStep?.requiredParams && box.checkStep.requiredParams.length > 0)
          ? box.checkStep.requiredParams[0]
          : null;

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

        return {
          id: `step-${n.id || idx + 1}`,
          stepNumber: idx + 1,
          name: String(n.name || `Step ${idx + 1}`),
          description: String(n.description || ''),
          stageId: `stage-${n.id || idx + 1}`,
          checkType,
          dualSourceCondition: dsc ? JSON.parse(JSON.stringify(dsc)) : undefined,
          toleranceMargin: Number(dsc?.toleranceMargin ?? box?.checkStep?.toleranceMargin ?? box?.checkStep?.tolerance ?? 0.00),
          targetDbId: String(n.targetDbId || box?.targetDbId || 'db-1'),
          targetTable: String(n.targetTable || box?.targetTable || 'transactions'),
          sourceField: String(srcField),
          targetField: String(tgtField),
          comparator: (dsc?.comparator === 'EQUALS' ? '=' : (dsc?.comparator as any)) || box?.checkStep?.comparator || (box?.checkStep?.operator as any) || '=',
          compareValue: compareVal !== undefined ? String(compareVal) : undefined,
          expectedValue: expectedVal !== undefined ? String(expectedVal) : undefined,
          regexPattern: box?.checkStep?.regexPattern || (n as any).regexPattern ? String(box?.checkStep?.regexPattern || (n as any).regexPattern) : undefined,
          sqlCondition: box?.checkStep?.sqlCondition || (n as any).sqlCondition ? String(box?.checkStep?.sqlCondition || (n as any).sqlCondition) : undefined,
          onPassAction: n.onPassAction || (box?.checkStep?.onPassAction as any) || 'CONTINUE',
          onFailAction: n.onFailAction || (box?.checkStep?.onFailAction as any) || (box?.checkStep?.actionOnFailure as any) || 'STOP',
          onErrorAction: 'STOP',
          reportColumnName: n.reportColumnName ? String(n.reportColumnName) : undefined,
          reportField: (n.reportField || box?.checkStep?.sourceField) ? String(n.reportField || box?.checkStep?.sourceField) : undefined,
          dependencyCondition: (idx === 0 || (idx > 0 && validationNodes[idx - 1]?.onFailAction === 'CONTINUE')) ? 'ALWAYS' : 'IF_PREV_SUCCESS',
          requiredParams: (() => {
            if (box?.boxType === 'INGESTION_SEARCH' && Array.isArray(box.searchParameters)) {
              const spReqs = box.searchParameters
                .filter(p => p.required !== false)
                .map(p => p.inputField || p.targetColumn)
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
          searchParameters: box?.searchParameters ? JSON.parse(JSON.stringify(box.searchParameters)) : undefined
        };
      });

      // Strict sanitization: Strip non-serializable properties and break any circular references
      const cleanNodes: FlowchartNode[] = validNodes.map((n, idx) => ({
        id: String(n.id || `node-${idx + 1}`),
        type: n.type,
        boxId: n.boxId ? String(n.boxId) : undefined,
        name: String(n.name || ''),
        description: String(n.description || ''),
        category: n.category ? String(n.category) : undefined,
        x: Math.round(Number(n.x) || 0),
        y: Math.round(Number(n.y) || 0),
        targetDbId: n.targetDbId ? String(n.targetDbId) : undefined,
        targetTable: n.targetTable ? String(n.targetTable) : undefined,
        onPassAction: n.onPassAction || 'CONTINUE',
        onFailAction: n.onFailAction || 'STOP',
        reportColumnName: n.reportColumnName ? String(n.reportColumnName) : undefined,
        reportField: n.reportField ? String(n.reportField) : undefined
      }));

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
          ...payload
        });
      }

      setSaveSuccessMsg('Vertical Flowchart saved! Intermediate Report columns are now synced with Investigation View.');
      setTimeout(() => setSaveSuccessMsg(''), 4000);

      const refreshed = await api.getWorkflows();
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

    // Terminal Node (START / END) -> Stadium Oval (w: 220, h: 60)
    if (node.type === 'START' || node.type === 'END') {
      const width = 220;
      const height = 60;
      if (port === 'input') return { x: node.x + width / 2, y: node.y };
      return { x: node.x + width / 2, y: node.y + height };
    }

    const isSearch = isNodeSearchBox(node);
    if (isSearch) {
      // Search & Ingest -> Rectangle (w: 260, h: 140)
      const width = 260;
      const height = 140;
      if (port === 'input') return { x: node.x + width / 2, y: node.y };
      if (port === 'pass') return { x: node.x + 70, y: node.y + height };
      if (port === 'fail') return { x: node.x + 190, y: node.y + height };
      return { x: node.x + width / 2, y: node.y + height };
    }

    // Condition Check -> Rhombus / Diamond (w: 240, h: 210)
    const width = 240;
    const height = 210;
    if (port === 'input') return { x: node.x + width / 2, y: node.y + 6 };
    if (port === 'pass') return { x: node.x + 48, y: node.y + 192 };
    if (port === 'fail') return { x: node.x + 192, y: node.y + 192 };
    return { x: node.x + width / 2, y: node.y + 204 };
  };

  const filteredBoxes = validationBoxes.filter(b => 
    b.name.toLowerCase().includes(paletteSearch.toLowerCase()) ||
    (b.targetTable && b.targetTable.toLowerCase().includes(paletteSearch.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      {/* Top Header & Settings Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-xl text-white">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-purple-600/30 text-purple-400 border border-purple-500/40 rounded-lg">
                <GitFork size={20} />
              </div>
              <h2 className="text-lg font-bold tracking-tight">Workflow Studio (Vertical Flowchart Maker)</h2>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                <span>Top ➔ Down Flow</span>
                <ArrowDown size={11} className="text-purple-300" />
              </span>
              {activeWorkflow && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Selected: <strong className="text-white">{activeWorkflow.name}</strong></span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Arrange validation blocks vertically, connect downward wire paths, and configure branch outcomes: <strong className="text-emerald-400">Continue</strong>, <strong className="text-rose-400">Stop</strong>, or <strong className="text-purple-400">Report</strong> (which adds a column to the Investigation View).
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleCreateNewFlowchart}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md transition"
              title="Create a brand new blank flowchart pipeline"
            >
              <Plus size={14} />
              <span>+ New Flowchart</span>
            </button>

            <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 shadow-2xs">
              <GitFork size={13} className="text-purple-400 shrink-0" />
              <select
                value={activeWorkflow?.id || ''}
                onChange={(e) => {
                  const found = (workflows || []).find(w => w && w.id === e.target.value);
                  if (found) selectWorkflow(found);
                }}
                className="bg-transparent text-xs text-slate-100 font-semibold focus:outline-none cursor-pointer"
                title="Select active workflow to inspect and edit"
              >
                <option value="" className="bg-slate-900 text-slate-400">-- Select Workflow ({(workflows || []).filter(Boolean).length}) --</option>
                {(workflows || []).filter(Boolean).map(wf => (
                  <option key={wf.id} value={wf.id} className="bg-slate-900 text-white">
                    {wf.name} {activeWorkflow?.id === wf.id ? '✓ (Active)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {activeWorkflow && (
              <button
                type="button"
                onClick={handleDeleteWorkflow}
                className="px-2.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/70 border border-rose-700/60 hover:border-rose-500 text-rose-300 hover:text-white rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                title={`Delete workflow "${activeWorkflow.name}"`}
              >
                <Trash2 size={13} className="text-rose-400" />
                <span>Delete Workflow</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleAutoAlignVertical}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
              title="Cleanly arrange all nodes vertically"
            >
              <AlignVerticalJustifyCenter size={13} className="text-purple-400" />
              <span>Auto-Align Vertical</span>
            </button>

            <button
              type="button"
              onClick={() => initDefaultFlowchart(validationBoxes)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition"
              title="Load standard two-stage template"
            >
              <Sparkles size={13} className="text-amber-400" />
              <span>Sample Flow</span>
            </button>

            {/* Message Aggregator Settings Button */}
            <button
              type="button"
              onClick={() => {
                setShowAggregatorModal(true);
                resetRuleForm(aggregatorTab);
              }}
              className="px-3 py-1.5 bg-indigo-950/70 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-200 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition shadow-sm"
              title="Configure aggregated Pass and Fail outcome messages for this workflow"
            >
              <Sliders size={13} className="text-indigo-400" />
              <span>Message Aggregator</span>
              {messageAggregations.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-indigo-600 text-white shadow-2xs">
                  {messageAggregations.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleSaveWorkflow}
              disabled={isSaving}
              className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-md transition disabled:opacity-50"
            >
              <Save size={14} />
              <span>{isSaving ? 'Saving...' : 'Save Flowchart'}</span>
            </button>
          </div>
        </div>

        {/* Workflow Title and Description Fields */}
        <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">Workflow Name:</label>
            <input
              type="text"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-white font-semibold focus:outline-none focus:border-purple-500"
              placeholder="e.g. Vertical Clearing Pipeline"
            />
          </div>
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">Category:</label>
            <select
              value={workflowCategory}
              onChange={(e: any) => setWorkflowCategory(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="Settlement">Settlement</option>
              <option value="Reconciliation">Reconciliation</option>
              <option value="Compliance">Compliance</option>
              <option value="Fulfillment">Fulfillment</option>
              <option value="Custom">Custom</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-mono text-slate-400 mb-1">Description:</label>
            <input
              type="text"
              value={workflowDescription}
              onChange={(e) => setWorkflowDescription(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-300 focus:outline-none focus:border-purple-500"
              placeholder="Brief summary of this vertical flow"
            />
          </div>
        </div>

        {saveSuccessMsg && (
          <div className="mt-2 p-2 bg-emerald-950/80 border border-emerald-600/50 rounded text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 size={14} className="text-emerald-400" />
            <span>{saveSuccessMsg}</span>
          </div>
        )}
      </div>

      {/* Main Studio Area: Palette Sidebar + Vertical Visual Canvas */}
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        {/* Left Sidebar: Palette of Blocks & Outcomes */}
        <div className="w-full lg:w-72 bg-white border border-slate-300 rounded-xl p-4 space-y-4 shadow-sm shrink-0">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <span className="font-bold text-xs uppercase tracking-wider font-mono text-slate-700 flex items-center gap-1.5">
              <Boxes size={14} className="text-purple-600" />
              <span>Toolbox Palette</span>
            </span>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-mono font-bold">
              {validationBoxes.length} Boxes
            </span>
          </div>

          {/* Core Pipeline Controls */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">Flow Control Terminals</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleAddTerminalNode('START', 'Transaction Ingress')}
                className="p-2 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-left transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
              >
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-600"></div>
                <span>Start Point (Top)</span>
              </button>
              <button
                type="button"
                onClick={() => handleAddTerminalNode('END', 'Reconciliation Goal')}
                className="p-2 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800 text-left transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
              >
                <ShieldCheck size={13} className="text-slate-600" />
                <span>End Goal (Bottom)</span>
              </button>
            </div>
          </div>

          {/* Validation Boxes List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase font-mono">Available Validation Blocks</span>
            </div>
            
            <div className="relative">
              <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={paletteSearch}
                onChange={(e) => setPaletteSearch(e.target.value)}
                placeholder="Search boxes..."
                className="w-full pl-7 pr-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-600 font-sans"
              />
            </div>

            <div className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
              {filteredBoxes.map(box => (
                <div
                  key={box.id}
                  onClick={() => handleAddBoxNode(box)}
                  className="p-2.5 bg-slate-50 hover:bg-purple-50/70 rounded-lg border border-slate-200 hover:border-purple-300 transition cursor-pointer group shadow-2xs"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold uppercase ${
                      box.boxType === 'INGESTION_SEARCH' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {box.boxType === 'INGESTION_SEARCH' ? 'Search / Ingest' : 'Condition Check'}
                    </span>
                    <Plus size={13} className="text-slate-400 group-hover:text-purple-600 transition" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-800 group-hover:text-purple-900 truncate">
                    {box.name}
                  </h4>
                  {box.targetTable && (
                    <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5">
                      Target: {box.targetTable}
                    </p>
                  )}
                </div>
              ))}

              {filteredBoxes.length === 0 && (
                <div className="p-3 text-center text-slate-400 italic text-xs">
                  No validation boxes found. Create boxes in the "Validation Box" tab.
                </div>
              )}
            </div>
          </div>

          {/* Decision Actions Legend */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] space-y-2">
            <span className="font-bold text-slate-700 font-mono block uppercase text-[10px]">Flowchart Notation:</span>
            <div className="flex items-center gap-2 text-slate-700">
              <span className="w-4 h-2.5 rounded-xs bg-emerald-700 border border-emerald-500 shrink-0"></span>
              <span><strong>Rectangle:</strong> Search & Ingest Block</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700">
              <span className="w-3 h-3 rotate-45 bg-blue-700 border border-blue-500 shrink-0"></span>
              <span><strong>Rhombus:</strong> Condition Check Block</span>
            </div>
            <div className="flex items-center gap-2 text-slate-700">
              <span className="w-4 h-2.5 rounded-full bg-emerald-600 border border-emerald-400 shrink-0"></span>
              <span><strong>Oval:</strong> Terminator (Start / End)</span>
            </div>

            <div className="pt-2 border-t border-slate-200 space-y-1">
              <span className="font-bold text-slate-700 font-mono block uppercase text-[10px]">Wire Output Actions:</span>
              <div className="flex items-center gap-1.5 text-slate-700">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                <span><strong>Continue:</strong> Advance downward</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-700">
                <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0"></span>
                <span><strong>Stop:</strong> Terminate / Flag record</span>
              </div>
              <div className="flex items-center gap-1.5 text-slate-700">
                <span className="w-2 h-2 rounded-full bg-purple-600 shrink-0"></span>
                <span><strong>Report:</strong> Add column to Investigation</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Interactive Vertical Flowchart Canvas */}
        <div className="flex-1 w-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm flex flex-col h-[820px] max-h-[85vh]">
          {/* Canvas Toolbar */}
          <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300">
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-950/80 text-purple-200 border border-purple-800 flex items-center gap-1.5 shadow-2xs">
                <GitFork size={12} className="text-purple-400" />
                <span>Workflow: <strong className="text-white">{workflowName || activeWorkflow?.name || 'Selected Pipeline'}</strong></span>
              </span>
              <span className="font-mono text-slate-400 font-semibold flex items-center gap-1.5">
                <Move size={13} className="text-purple-400" />
                <span>Vertical DAG: {nodes.length} Nodes, {connections.length} Wires</span>
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                <span>Height: {canvasDimensions.height}px</span>
                <ArrowDown size={10} className="text-emerald-400" />
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setExtraCanvasHeight(h => h + 600)}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-purple-300 border border-slate-700 rounded text-xs flex items-center gap-1 cursor-pointer transition shadow-xs"
                title="Extend canvas height by +600px to build arbitrarily long workflows"
              >
                <Plus size={12} />
                <span>+600px Height</span>
              </button>
              <button
                type="button"
                onClick={() => canvasRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
                className="px-2 py-1 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 rounded transition cursor-pointer text-xs flex items-center gap-1"
                title="Scroll to top of canvas"
              >
                <ArrowDown size={12} className="rotate-180 text-blue-400" />
                <span>Top</span>
              </button>
              <button
                type="button"
                onClick={() => canvasRef.current?.scrollTo({ top: canvasRef.current.scrollHeight, behavior: 'smooth' })}
                className="px-2 py-1 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 rounded transition cursor-pointer text-xs flex items-center gap-1"
                title="Scroll to bottom of canvas"
              >
                <ArrowDown size={12} className="text-blue-400" />
                <span>Bottom</span>
              </button>
              <button
                type="button"
                onClick={() => setNodes([])}
                className="px-2 py-1 hover:bg-slate-800 text-slate-400 hover:text-rose-400 rounded transition cursor-pointer text-xs"
                title="Clear canvas"
              >
                Clear
              </button>
            </div>
          </div>

          {/* SVG Connection Layer & Node Container with Infinite Scroll */}
          <div
            ref={canvasRef}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            className="relative flex-1 bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:20px_20px] bg-slate-900 select-none overflow-auto p-6"
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
                <marker id="arrow-emerald" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
                </marker>
                <marker id="arrow-rose" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#f43f5e" />
                </marker>
                <marker id="arrow-purple" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#a855f7" />
                </marker>
                <marker id="arrow-blue" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#38bdf8" />
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

                const isReport = conn.action === 'REPORT';
                const isStop = conn.action === 'STOP';
                const strokeColor = isReport ? '#a855f7' : isStop ? '#f43f5e' : '#10b981';
                const markerId = isReport ? 'url(#arrow-purple)' : isStop ? 'url(#arrow-rose)' : 'url(#arrow-emerald)';

                return (
                  <g key={conn.id} className="pointer-events-auto cursor-pointer group" onClick={() => setSelectedConnection(conn)}>
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
                      strokeWidth={isReport ? '3' : '2.5'}
                      strokeDasharray={isReport ? '5 3' : 'none'}
                      markerEnd={markerId}
                      className="group-hover:stroke-white transition"
                    />
                    {/* Action badge on wire */}
                    <foreignObject x={midX - 48} y={midY - 14} width="96" height="28">
                      <div className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono text-center shadow-md border truncate ${
                        isReport ? 'bg-purple-950 text-purple-200 border-purple-400' :
                        isStop ? 'bg-rose-950 text-rose-200 border-rose-500' :
                        'bg-emerald-950 text-emerald-200 border-emerald-500'
                      }`}>
                        {conn.label || conn.action}
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
                  stroke="#38bdf8"
                  strokeWidth="2.5"
                  strokeDasharray="5 3"
                  markerEnd="url(#arrow-blue)"
                />
              )}
            </svg>

            {nodes.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-auto">
                <div className="bg-slate-800/90 border border-slate-700 rounded-2xl p-8 max-w-md text-center shadow-2xl backdrop-blur-xs">
                  <div className="w-12 h-12 rounded-xl bg-slate-700/80 text-emerald-400 flex items-center justify-center mx-auto mb-3">
                    <GitFork size={24} />
                  </div>
                  <h3 className="text-sm font-bold text-white mb-1">No Flowchart Pipeline Configured</h3>
                  <p className="text-xs text-slate-400 mb-5">
                    There are no active flowchart workflows. Create a new pipeline or drag blocks from the left palette to begin.
                  </p>
                  <button
                    type="button"
                    onClick={handleCreateNewFlowchart}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-sm transition inline-flex items-center gap-2 cursor-pointer"
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
              const isSearch = isNodeSearchBox(node);
              const hasReportColumn = Boolean(node.reportColumnName);

              // 1. TERMINAL NODES (START / END) - Flowchart Stadium Oval
              if (isStart || isEnd) {
                return (
                  <div
                    key={node.id}
                    style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
                    onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                    className={`absolute w-[220px] h-[60px] rounded-full select-none z-10 transition-shadow shadow-xl flex items-center justify-between px-4 border-2 cursor-grab active:cursor-grabbing ${
                      isStart
                        ? 'bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-950 border-emerald-400 text-white'
                        : 'bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border-slate-500 text-white'
                    }`}
                  >
                    {/* Top Input Port (End only) */}
                    {isEnd && (
                      <div
                        title="Input Port (Drop wire here)"
                        onMouseUp={(e) => handleCompleteWire(e, node.id)}
                        className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-slate-800 border-2 border-slate-300 hover:border-purple-400 hover:scale-125 flex items-center justify-center transition cursor-pointer z-20 shadow-md"
                      >
                        <div className="w-2 h-2 rounded-full bg-white"></div>
                      </div>
                    )}

                    <div className="flex items-center gap-2 min-w-0">
                      {isStart ? (
                        <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse shrink-0"></div>
                      ) : (
                        <ShieldCheck size={16} className="text-slate-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-emerald-300">
                          {isStart ? 'TERMINAL START' : 'TERMINAL END'}
                        </div>
                        <h4 className="font-bold text-xs truncate">{node.name}</h4>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteNode(node.id);
                      }}
                      className="p-1 hover:bg-rose-500/20 rounded-full text-slate-400 hover:text-rose-400 transition"
                      title="Remove Terminal"
                    >
                      <Trash2 size={12} />
                    </button>

                    {/* Bottom Output Port (Start only) */}
                    {isStart && (
                      <div
                        title="Drag downwards to connect start of pipeline"
                        onMouseDown={(e) => handleStartWire(e, node.id, 'output')}
                        className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-emerald-600 border-2 border-white hover:scale-125 flex items-center justify-center transition cursor-crosshair z-20 shadow-md"
                      >
                        <ArrowDown size={11} className="text-white" />
                      </div>
                    )}
                  </div>
                );
              }

              // 2. SEARCH & INGESTION BOX - Flowchart RECTANGLE (Process Block)
              if (isSearch) {
                return (
                  <div
                    key={node.id}
                    style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
                    onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                    className="absolute w-[260px] min-h-[140px] rounded-lg select-none z-10 bg-slate-900/95 backdrop-blur-sm border-2 border-emerald-500/80 hover:border-emerald-400 shadow-2xl text-white flex flex-col justify-between transition-shadow cursor-grab active:cursor-grabbing group"
                  >
                    {/* Top Input Port */}
                    <div
                      title="Input Port (Drop wire here)"
                      onMouseUp={(e) => handleCompleteWire(e, node.id)}
                      className="absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-slate-800 border-2 border-emerald-400 hover:border-white hover:scale-125 flex items-center justify-center transition cursor-pointer z-20 shadow-md"
                    >
                      <div className="w-2 h-2 rounded-full bg-emerald-300"></div>
                    </div>

                    {/* Rectangle Header */}
                    <div className="p-2.5 pb-2 border-b border-emerald-500/20 bg-emerald-950/40 flex items-center justify-between rounded-t-md">
                      <div className="flex items-center gap-1.5 truncate">
                        <Database size={13} className="text-emerald-400 shrink-0" />
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-300 truncate">
                          SEARCH & INGEST
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedNode(node);
                          }}
                          className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition"
                          title="Configure Block"
                        >
                          <Sliders size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteNode(node.id);
                          }}
                          className="p-1 hover:bg-rose-500/20 rounded text-slate-400 hover:text-rose-400 transition"
                          title="Remove Block"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {/* Rectangle Body */}
                    <div className="p-3 space-y-1.5 text-xs">
                      <h3 className="font-bold text-slate-100 text-xs tracking-tight line-clamp-1">
                        {node.name}
                      </h3>
                      {node.targetTable && (
                        <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
                          <span className="text-slate-500">Target:</span>
                          <span className="bg-emerald-950/80 px-1.5 py-0.2 rounded border border-emerald-800/40 font-semibold truncate">
                            {node.targetTable}
                          </span>
                        </div>
                      )}
                      <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">
                        {node.description || 'Database query & parameter mapping'}
                      </p>

                      {hasReportColumn && (
                        <div className="p-1 bg-purple-950/80 border border-purple-500/40 rounded flex items-center justify-between gap-1 text-[9px]">
                          <span className="text-purple-300 font-bold truncate flex items-center gap-1 font-mono">
                            <FileSpreadsheet size={10} className="text-purple-400" />
                            <span>Col: "{node.reportColumnName}"</span>
                          </span>
                          <span className="px-1 py-0.2 rounded bg-purple-700 text-white font-mono text-[8px] font-bold">
                            GRID
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Rectangle Bottom Egress Ports */}
                    <div className="p-2 border-t border-emerald-500/20 flex items-center justify-between text-[10px] font-mono bg-emerald-950/20 rounded-b-md">
                      <button
                        type="button"
                        title="Drag downwards on PASS"
                        onMouseDown={(e) => handleStartWire(e, node.id, 'pass')}
                        className="px-2.5 py-1 rounded-md bg-emerald-950/90 text-emerald-300 border border-emerald-500 hover:bg-emerald-800 hover:scale-105 flex items-center gap-1 cursor-crosshair transition shadow-xs"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
                        <span>PASS ➔</span>
                      </button>

                      <button
                        type="button"
                        title="Drag downwards on FAIL"
                        onMouseDown={(e) => handleStartWire(e, node.id, 'fail')}
                        className="px-2.5 py-1 rounded-md bg-rose-950/90 text-rose-300 border border-rose-500 hover:bg-rose-800 hover:scale-105 flex items-center gap-1 cursor-crosshair transition shadow-xs"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div>
                        <span>FAIL ✕</span>
                      </button>
                    </div>
                  </div>
                );
              }

              // 3. CONDITION CHECK BOX - Flowchart RHOMBUS / DIAMOND (Decision Block)
              return (
                <div
                  key={node.id}
                  style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
                  onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                  className="absolute w-[240px] h-[210px] select-none z-10 flex flex-col items-center justify-center cursor-grab active:cursor-grabbing group"
                >
                  {/* SVG Rhombus Background */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none drop-shadow-2xl" viewBox="0 0 240 210">
                    <polygon
                      points="120,6 234,105 120,204 6,105"
                      fill="#0b1329"
                      stroke="#3b82f6"
                      strokeWidth="2.5"
                      strokeLinejoin="round"
                    />
                    <polygon
                      points="120,14 224,105 120,196 16,105"
                      fill="none"
                      stroke="#1d4ed8"
                      strokeWidth="1"
                      strokeOpacity="0.35"
                      strokeDasharray="4 2"
                    />
                  </svg>

                  {/* Top Input Port (Top Diamond Vertex) */}
                  <div
                    title="Input Port (Drop wire here)"
                    onMouseUp={(e) => handleCompleteWire(e, node.id)}
                    className="absolute -top-2.5 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-slate-900 border-2 border-blue-400 hover:border-white hover:scale-125 flex items-center justify-center transition cursor-pointer z-30 shadow-md"
                  >
                    <div className="w-2 h-2 rounded-full bg-blue-300"></div>
                  </div>

                  {/* Centered Rhombus Content */}
                  <div className="w-[154px] z-10 text-center space-y-1 my-auto">
                    <div className="flex items-center justify-center gap-1 text-[9px] font-bold font-mono uppercase tracking-wider text-blue-300 bg-blue-950/80 px-2 py-0.5 rounded-full border border-blue-500/40 w-fit mx-auto shadow-xs">
                      <CheckCircle2 size={10} className="text-blue-400" />
                      <span>DECISION</span>
                    </div>

                    <h3 className="font-bold text-white text-xs tracking-tight truncate max-w-[150px] mx-auto" title={node.name}>
                      {node.name}
                    </h3>

                    <p className="text-[10px] text-blue-200 font-mono truncate px-1.5 py-0.5 bg-slate-950/90 rounded border border-blue-900/60 max-w-[150px] mx-auto">
                      {node.description || 'Condition check'}
                    </p>

                    {node.onPassAction === 'STOP' && (
                      <span className="inline-block text-[8px] font-mono font-bold text-rose-300 bg-rose-950/90 px-1.5 py-0.2 rounded border border-rose-500/50">
                        Pass ➔ STOP
                      </span>
                    )}

                    {node.onFailAction === 'CONTINUE' && (
                      <span className="inline-block text-[8px] font-mono font-bold text-amber-300 bg-amber-950/90 px-1.5 py-0.2 rounded border border-amber-500/50">
                        Fail ➔ CONTINUE
                      </span>
                    )}

                    {hasReportColumn && (
                      <span className="inline-block text-[8px] font-mono text-purple-300 bg-purple-950/80 px-1 py-0.2 rounded border border-purple-500/40">
                        Col: {node.reportColumnName}
                      </span>
                    )}

                    <div className="flex items-center justify-center gap-1 pt-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedNode(node);
                        }}
                        className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition"
                        title="Configure Check"
                      >
                        <Sliders size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNode(node.id);
                        }}
                        className="p-1 hover:bg-rose-500/20 rounded text-slate-400 hover:text-rose-400 transition"
                        title="Remove Check"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>

                  {/* Bottom Ports for Decision Rhombus: PASS on left, FAIL on right */}
                  <button
                    type="button"
                    title={`Drag downwards on PASS (Configured: ${node.onPassAction || 'CONTINUE'})`}
                    style={{ left: '20px', bottom: '12px' }}
                    onMouseDown={(e) => handleStartWire(e, node.id, 'pass')}
                    className={`absolute z-20 px-2 py-0.5 rounded-md text-[9px] font-mono font-bold shadow-md transition flex items-center gap-1 cursor-crosshair hover:scale-105 ${
                      node.onPassAction === 'STOP'
                        ? 'bg-rose-950/95 text-rose-300 border border-rose-500 hover:bg-rose-800'
                        : 'bg-emerald-950/95 text-emerald-300 border border-emerald-500 hover:bg-emerald-800'
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${node.onPassAction === 'STOP' ? 'bg-rose-400' : 'bg-emerald-400 animate-pulse'}`}></div>
                    <span>PASS {node.onPassAction === 'STOP' ? '✕' : '➔'}</span>
                  </button>

                  <button
                    type="button"
                    title={`Drag downwards on FAIL (Configured: ${node.onFailAction || 'STOP'})`}
                    style={{ right: '20px', bottom: '12px' }}
                    onMouseDown={(e) => handleStartWire(e, node.id, 'fail')}
                    className={`absolute z-20 px-2 py-0.5 rounded-md text-[9px] font-mono font-bold shadow-md transition flex items-center gap-1 cursor-crosshair hover:scale-105 ${
                      node.onFailAction === 'CONTINUE'
                        ? 'bg-amber-950/95 text-amber-300 border border-amber-500 hover:bg-amber-800'
                        : 'bg-rose-950/95 text-rose-300 border border-rose-500 hover:bg-rose-800'
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${node.onFailAction === 'CONTINUE' ? 'bg-amber-400' : 'bg-rose-400'}`}></div>
                    <span>FAIL {node.onFailAction === 'CONTINUE' ? '➔' : '✕'}</span>
                  </button>
                </div>
              );
            })}
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          CONNECTION DECISION INSPECTOR (CONTINUE / STOP / REPORT)
          ========================================================================= */}
      {selectedConnection && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl animate-in zoom-in-95 text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Link2 size={16} className="text-purple-400" />
                <h3 className="font-bold text-xs uppercase tracking-wider font-mono text-white">
                  Connection Branch Outcome
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedConnection(null)}
                className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Configure what happens when transaction evaluation follows this wire:
            </p>

            {/* Action Selection Radio */}
            <div className="space-y-2">
              <label
                onClick={() => setSelectedConnection({ ...selectedConnection, action: 'CONTINUE', label: 'Continue' })}
                className={`p-3 rounded-lg border flex items-start gap-3 cursor-pointer transition ${
                  selectedConnection.action === 'CONTINUE'
                    ? 'bg-emerald-950/60 border-emerald-500 text-emerald-100'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="connAction"
                  checked={selectedConnection.action === 'CONTINUE'}
                  onChange={() => {}}
                  className="mt-1 text-emerald-500 focus:ring-emerald-500"
                />
                <div>
                  <span className="font-bold text-xs block text-white">🟢 Continue Downstream</span>
                  <span className="text-[11px] text-slate-400">Progress directly to the connected downstream validation block.</span>
                </div>
              </label>

              <label
                onClick={() => setSelectedConnection({ ...selectedConnection, action: 'STOP', label: 'Stop Pipeline' })}
                className={`p-3 rounded-lg border flex items-start gap-3 cursor-pointer transition ${
                  selectedConnection.action === 'STOP'
                    ? 'bg-rose-950/60 border-rose-500 text-rose-100'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="connAction"
                  checked={selectedConnection.action === 'STOP'}
                  onChange={() => {}}
                  className="mt-1 text-rose-500 focus:ring-rose-500"
                />
                <div>
                  <span className="font-bold text-xs block text-white">🔴 Stop Pipeline</span>
                  <span className="text-[11px] text-slate-400">Halt transaction execution here and mark transaction as FLAGGED or TERMINATED.</span>
                </div>
              </label>

              <label
                onClick={() => setSelectedConnection({ ...selectedConnection, action: 'REPORT', label: 'Report & Continue' })}
                className={`p-3 rounded-lg border flex items-start gap-3 cursor-pointer transition ${
                  selectedConnection.action === 'REPORT'
                    ? 'bg-purple-950/60 border-purple-500 text-purple-100'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="connAction"
                  checked={selectedConnection.action === 'REPORT'}
                  onChange={() => {}}
                  className="mt-1 text-purple-500 focus:ring-purple-500"
                />
                <div>
                  <span className="font-bold text-xs block text-white">📊 Intermediate Report Function</span>
                  <span className="text-[11px] text-slate-400">
                    Captures this node's evaluated result or mirror data and projects it as an extra visible column in the Investigation View.
                  </span>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => handleDeleteConnection(selectedConnection.id)}
                className="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-700 text-rose-300 rounded text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition"
              >
                <Unlink size={13} />
                <span>Delete Wire</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setConnections(prev => prev.map(c => c.id === selectedConnection.id ? selectedConnection : c));
                  if (selectedConnection.fromPort === 'fail') {
                    setNodes(prev => prev.map(n => n.id === selectedConnection.fromNodeId ? { ...n, onFailAction: selectedConnection.action } : n));
                  } else if (selectedConnection.fromPort === 'pass') {
                    setNodes(prev => prev.map(n => n.id === selectedConnection.fromNodeId ? { ...n, onPassAction: selectedConnection.action } : n));
                  }
                  setSelectedConnection(null);
                }}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-bold cursor-pointer transition shadow-md"
              >
                Apply Outcome
              </button>
            </div>
          </div>
        </div>
      )}

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
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                      aggregatorTab === 'FAIL'
                        ? 'bg-rose-600 text-white shadow-md shadow-rose-950'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    <AlertTriangle size={13} />
                    <span>FAIL Aggregations</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      aggregatorTab === 'FAIL' ? 'bg-rose-800 text-white' : 'bg-slate-800 text-slate-400'
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
                    className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition cursor-pointer ${
                      aggregatorTab === 'PASS'
                        ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                    }`}
                  >
                    <CheckCircle2 size={13} />
                    <span>PASS Aggregations</span>
                    <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      aggregatorTab === 'PASS' ? 'bg-emerald-800 text-white' : 'bg-slate-800 text-slate-400'
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
                              className={`p-2.5 rounded-lg border text-xs cursor-pointer transition flex items-start gap-2.5 ${
                                isSelected
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
                                <span className={`px-2 py-0.2 rounded-full text-[9px] font-bold font-mono ${
                                  rule.type === 'FAIL'
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


      {/* =========================================================================
          NODE CONFIGURATION & REPORT COLUMN MODAL
          ========================================================================= */}
      {selectedNode && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-2xs z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl animate-in zoom-in-95 text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Sliders size={16} className="text-purple-400" />
                <h3 className="font-bold text-xs uppercase tracking-wider font-mono text-white">
                  Configure: {selectedNode.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">Block Label:</label>
                <input
                  type="text"
                  value={selectedNode.name}
                  onChange={(e) => setSelectedNode({ ...selectedNode, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              {/* Pipeline Routing Outcomes (PASS & FAIL) */}
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg space-y-2.5">
                <span className="font-bold text-slate-300 flex items-center gap-1.5 text-[11px] font-mono uppercase">
                  <Sliders size={13} className="text-blue-400" />
                  <span>Pipeline Routing Outcomes</span>
                </span>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono text-emerald-400 mb-1 font-semibold">On PASS Action:</label>
                    <select
                      value={selectedNode.onPassAction || 'CONTINUE'}
                      onChange={(e) => setSelectedNode({ ...selectedNode, onPassAction: e.target.value as FlowchartOutputAction })}
                      className={`w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs font-semibold focus:outline-none font-mono ${
                        selectedNode.onPassAction === 'STOP' ? 'text-rose-400 border-rose-500/60' : 'text-emerald-300 focus:border-emerald-500'
                      }`}
                    >
                      <option value="CONTINUE">CONTINUE (Advance)</option>
                      <option value="STOP">STOP (Halt Pipeline)</option>
                      <option value="REPORT">REPORT (Add Grid Col)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-rose-400 mb-1 font-semibold">On FAILURE Action:</label>
                    <select
                      value={selectedNode.onFailAction || 'STOP'}
                      onChange={(e) => setSelectedNode({ ...selectedNode, onFailAction: e.target.value as FlowchartOutputAction })}
                      className={`w-full bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs font-semibold focus:outline-none font-mono ${
                        selectedNode.onFailAction === 'CONTINUE' ? 'text-blue-400 border-blue-500/60' : 'text-rose-400'
                      }`}
                    >
                      <option value="CONTINUE">CONTINUE (Advance)</option>
                      <option value="STOP">STOP (Halt Pipeline)</option>
                      <option value="REPORT">REPORT (Add Grid Col)</option>
                    </select>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Controls whether the investigation advances downstream when this block yields a FAIL verdict.
                </p>
              </div>

              {/* Intermediate Report Column Setting */}
              <div className="p-3 bg-purple-950/30 border border-purple-500/30 rounded-lg space-y-2">
                <span className="font-bold text-purple-300 flex items-center gap-1.5 text-[11px] font-mono uppercase">
                  <FileSpreadsheet size={13} className="text-purple-400" />
                  <span>Intermediate Report Column</span>
                </span>
                <p className="text-[11px] text-slate-400">
                  Adds a dedicated column in the Investigation View to show the evaluated output or retrieved mirror value for every row.
                </p>

                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">Investigation Grid Column Title:</label>
                  <input
                    type="text"
                    value={selectedNode.reportColumnName || ''}
                    onChange={(e) => setSelectedNode({ ...selectedNode, reportColumnName: e.target.value })}
                    placeholder="e.g. Gateway Auth Result or Net Amount Variance"
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-purple-200 text-xs focus:outline-none focus:border-purple-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-slate-400 mb-1">
                    Target Field / Property <span className="text-purple-400 font-normal">(Global List)</span>:
                  </label>
                  <select
                    value={selectedNode.reportField || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      const std = globalMappingService.getStandardFields().find(f => f.key === val);
                      setSelectedNode({
                        ...selectedNode,
                        reportField: val,
                        reportColumnName: (!selectedNode.reportColumnName || selectedNode.reportColumnName === 'Result') && std
                          ? std.label
                          : selectedNode.reportColumnName
                      });
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-300 text-xs focus:outline-none focus:border-purple-500 font-mono"
                  >
                    <option value="">-- Select Standard Field (Global List) --</option>
                    {globalMappingService.getStandardFields().map(f => (
                      <option key={f.key} value={f.key}>{f.label} ({f.key})</option>
                    ))}
                    {selectedNode.reportField && !globalMappingService.getStandardFields().some(f => f.key === selectedNode.reportField) && (
                      <option value={selectedNode.reportField}>{selectedNode.reportField} (Custom)</option>
                    )}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedNode(null)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setNodes(prev => prev.map(n => n.id === selectedNode.id ? selectedNode : n));
                  setSelectedNode(null);
                }}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-bold cursor-pointer transition shadow-md"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
