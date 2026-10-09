import React, { useState, useEffect } from 'react';
import { 
  FlowchartNode, 
  FlowchartConnection, 
  FlowchartOutputAction, 
  ValidationBox,
  DatabaseColumnConfiguration,
  MultiRowCardinalityPolicy,
  AggregationStrategy
} from '../../../types';
import { 
  Sliders, Link2, X, Trash2, CheckCircle2, 
  FileSpreadsheet, ArrowRight, Unlink, ShieldCheck, Database, Info,
  Layers, CheckSquare, Square, AlertCircle, RefreshCw, Table, ChevronDown
} from 'lucide-react';
import { globalMappingService } from '../../../services/globalMappingService';
import { api } from '../../../api/client';

interface WorkflowInspectorProps {
  selectedNode: FlowchartNode | null;
  onUpdateNode: (updated: FlowchartNode) => void;
  onDeleteNode: (nodeId: string) => void;
  onCloseNode: () => void;

  selectedConnection: FlowchartConnection | null;
  onUpdateConnection: (updated: FlowchartConnection) => void;
  onDeleteConnection: (connectionId: string) => void;
  onCloseConnection: () => void;

  validationBoxes: ValidationBox[];
  databases?: any[];
  defaultWorkflowDbId?: string;
  defaultWorkflowTable?: string;

  // Workflow-level DB configuration acceptance
  workflowName?: string;
  workflowCategory?: string;
  workflowDescription?: string;
  workflowDbId?: string;
  workflowTable?: string;
  workflowAttachedDbConfigIds?: string[];
  onUpdateWorkflowDbConfig?: (updates: {
    targetDbId?: string;
    targetTable?: string;
    attachedDbConfigIds?: string[];
  }) => void;
  onCloseInspector?: () => void;
}

export const getRuleTypeBadge = (ruleType: string) => {
  switch (ruleType) {
    case 'COMPLETENESS_CHECK':
      return { bg: 'bg-emerald-950/80 text-emerald-300 border-emerald-800', label: 'Completeness' };
    case 'VALUE_RANGE_CHECK':
      return { bg: 'bg-amber-950/80 text-amber-300 border-amber-800', label: 'Value Range' };
    case 'DUPLICATE_CHECK':
      return { bg: 'bg-indigo-950/80 text-indigo-300 border-indigo-800', label: 'Duplicate' };
    case 'VALUE_LABEL_CHECK':
      return { bg: 'bg-purple-950/80 text-purple-300 border-purple-800', label: 'Labels' };
    case 'PATTERN_CHECK':
    case 'FORMAT_REGEX':
      return { bg: 'bg-cyan-950/80 text-cyan-300 border-cyan-800', label: 'Format Regex' };
    case 'ALLOWED_VALUES_CHECK':
      return { bg: 'bg-blue-950/80 text-blue-300 border-blue-800', label: 'Allowed Values' };
    case 'ISO_DECLINE_CODE':
      return { bg: 'bg-rose-950/80 text-rose-300 border-rose-800', label: 'ISO Decline' };
    default:
      return { bg: 'bg-slate-800 text-slate-300 border-slate-700', label: (ruleType || '').replace('_CHECK', '') };
  }
};

export const WorkflowInspector: React.FC<WorkflowInspectorProps> = ({
  selectedNode,
  onUpdateNode,
  onDeleteNode,
  onCloseNode,
  selectedConnection,
  onUpdateConnection,
  onDeleteConnection,
  onCloseConnection,
  validationBoxes,
  databases = [],
  defaultWorkflowDbId,
  defaultWorkflowTable,
  workflowName,
  workflowCategory,
  workflowDescription,
  workflowDbId,
  workflowTable,
  workflowAttachedDbConfigIds = [],
  onUpdateWorkflowDbConfig,
  onCloseInspector
}) => {
  const boundBox = selectedNode ? validationBoxes.find(b => b.id === selectedNode.boxId) : null;
  const isTerminal = selectedNode ? (selectedNode.type === 'START' || selectedNode.type === 'END') : false;

  // Determine effective target database and table for the selected node or workflow
  const effectiveDbId = selectedNode
    ? (selectedNode.targetDbId || boundBox?.targetDbId || defaultWorkflowDbId || (databases[0]?.id ?? ''))
    : (workflowDbId || defaultWorkflowDbId || (databases[0]?.id ?? ''));

  const effectiveTable = selectedNode
    ? (selectedNode.targetTable || boundBox?.targetTable || defaultWorkflowTable || 'transactions')
    : (workflowTable || defaultWorkflowTable || '');

  // Available column configuration rules for the active target database and table
  const [availableConfigs, setAvailableConfigs] = useState<DatabaseColumnConfiguration[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState<boolean>(false);

  useEffect(() => {
    if (selectedNode && (isTerminal || !effectiveDbId || !effectiveTable)) {
      setAvailableConfigs([]);
      return;
    }

    if (!effectiveDbId || !effectiveTable) {
      setAvailableConfigs([]);
      return;
    }

    let isMounted = true;
    setLoadingConfigs(true);
    api.getColumnConfigurations(effectiveDbId, effectiveTable)
      .then(cfgs => {
        if (isMounted) {
          setAvailableConfigs(Array.isArray(cfgs) ? cfgs : []);
        }
      })
      .catch(err => {
        console.warn('[WorkflowInspector] Could not load column configurations:', err);
        if (isMounted) setAvailableConfigs([]);
      })
      .finally(() => {
        if (isMounted) setLoadingConfigs(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedNode?.id, effectiveDbId, effectiveTable, isTerminal]);

  // Inspector UI Tab and Accordion States
  const [inspectorTab, setInspectorTab] = useState<'config' | 'rules'>('config');
  const [ruleDefOpen, setRuleDefOpen] = useState<boolean>(true);
  const [passOpen, setPassOpen] = useState<boolean>(true);
  const [failOpen, setFailOpen] = useState<boolean>(true);
  const [logsOpen, setLogsOpen] = useState<boolean>(true);

  // Case 1: Inspecting a Node
  if (selectedNode) {
    const currentAttachedIds = Array.isArray(selectedNode.attachedDbConfigIds)
      ? selectedNode.attachedDbConfigIds
      : (Array.isArray(selectedNode.columnConfigurationIds) ? selectedNode.columnConfigurationIds : []);

    const toggleConfigId = (cfgId: string) => {
      const isAttached = currentAttachedIds.includes(cfgId);
      const nextIds = isAttached
        ? currentAttachedIds.filter(id => id !== cfgId)
        : [...currentAttachedIds, cfgId];
      onUpdateNode({
        ...selectedNode,
        attachedDbConfigIds: nextIds,
        columnConfigurationIds: nextIds
      });
    };

    const selectAllConfigs = () => {
      const allIds = availableConfigs.map(c => c.id);
      onUpdateNode({
        ...selectedNode,
        attachedDbConfigIds: allIds,
        columnConfigurationIds: allIds
      });
    };

    const clearAllConfigs = () => {
      onUpdateNode({
        ...selectedNode,
        attachedDbConfigIds: [],
        columnConfigurationIds: []
      });
    };

    const selectedDbObj = databases.find(d => d.id === effectiveDbId);
    const availableTables = (selectedDbObj?.allowedTables && selectedDbObj.allowedTables.length > 0)
      ? selectedDbObj.allowedTables
      : (selectedDbObj?.availableTables || []);

    const inspectorTitle = selectedNode.name
      ? `${selectedNode.name.split(' ')[0]} Inspector`
      : 'Block Inspector';

    const inspectorSubtitle = boundBox?.name || selectedNode.name || selectedNode.id;

    return (
      <aside 
        className="w-80 bg-[#071318] border-l border-[#163848] flex flex-col h-full text-slate-200 overflow-y-auto font-sans"
        aria-label="Node Inspector"
      >
        {/* Panel Header matching screenshot */}
        <div className="p-3.5 border-b border-[#163848] flex items-center justify-between bg-[#09171f] sticky top-0 z-10">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-[#181c38] border border-purple-500/50 text-purple-300 rounded-lg shadow-xs">
              <Sliders size={16} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white tracking-wide">
                {inspectorTitle}
              </h3>
              <p className="text-[10px] text-teal-400/80 font-mono truncate max-w-[170px]">
                {inspectorSubtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseNode}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-[#163848] transition cursor-pointer"
            title="Close Inspector"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Navigation: Config | Rules */}
        <div className="flex items-center border-b border-[#163848] bg-[#071318] px-4">
          <button
            type="button"
            onClick={() => setInspectorTab('config')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition cursor-pointer ${
              inspectorTab === 'config'
                ? 'border-[#00e5b3] text-[#00e5b3] font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Config
          </button>
          <button
            type="button"
            onClick={() => setInspectorTab('rules')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition cursor-pointer ${
              inspectorTab === 'rules'
                ? 'border-[#00e5b3] text-[#00e5b3] font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Rules {currentAttachedIds.length > 0 && `(${currentAttachedIds.length})`}
          </button>
        </div>

        {inspectorTab === 'config' ? (
          <div className="p-4 space-y-4 text-xs flex-1">
            {/* Summary Metadata Key-Value List matching screenshot */}
            <div className="space-y-1.5 py-1 text-xs">
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-400">Node Type:</span>
                <span className="font-bold text-[#2dd4bf]">
                  {selectedNode.type === 'VALIDATION' ? 'VALIDATION_BOX' : selectedNode.type}
                </span>
              </div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-400">Validation Box:</span>
                <span className="text-[#2dd4bf] font-mono truncate max-w-[150px]">
                  {boundBox?.name || selectedNode.name || 'auth_log_tab'}
                </span>
              </div>
              <div className="flex items-center justify-between font-mono">
                <span className="text-slate-400">Target Table:</span>
                <span className="text-[#2dd4bf] font-mono truncate max-w-[150px]">
                  {effectiveTable || 'tran_log_tab'}
                </span>
              </div>
            </div>

            {/* Editable Block Label */}
            <div className="space-y-1">
              <label className="block text-[10px] font-mono text-slate-400 uppercase font-semibold">
                Label Override
              </label>
              <input
                type="text"
                value={selectedNode.name || ''}
                onChange={(e) => onUpdateNode({ ...selectedNode, name: e.target.value })}
                className="w-full bg-[#091a22] border border-[#163848] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#00e5b3] font-sans"
              />
            </div>

            {/* DB Configuration Section with SQL Box */}
            {!isTerminal && (
              <div className="space-y-2">
                <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  DB Configuration
                </div>

                {/* Collapsible Rule Definition Accordion */}
                <div className="bg-[#091a22] border border-[#163848] rounded-xl overflow-hidden shadow-sm">
                  <button
                    type="button"
                    onClick={() => setRuleDefOpen(!ruleDefOpen)}
                    className="w-full px-3.5 py-2 flex items-center justify-between text-left text-xs font-bold text-white hover:bg-[#0c242e] transition cursor-pointer"
                  >
                    <span className="text-slate-200">Rule Definition</span>
                    <ChevronDown size={14} className={`text-cyan-400 transition-transform ${ruleDefOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {ruleDefOpen && (
                    <div className="p-3 border-t border-[#163848] space-y-3 bg-[#07151c]">
                      {/* Code Block with line numbers matching screenshot */}
                      <div>
                        <label className="block text-[10px] font-mono text-slate-400 mb-1 font-bold">SQL</label>
                        <div className="bg-[#051c22] border border-[#16424f] rounded-lg p-2.5 font-mono text-xs text-cyan-300 leading-relaxed shadow-inner">
                          <div className="flex gap-3">
                            <span className="text-slate-500 select-none">1</span>
                            <span>SELECT ({selectedDbObj?.type ? selectedDbObj.type.toUpperCase() : 'MySQL'})</span>
                          </div>
                          <div className="flex gap-3">
                            <span className="text-slate-500 select-none">2</span>
                            <span>TARGET: <span className="text-emerald-300">{effectiveTable}</span></span>
                          </div>
                          <div className="flex gap-3">
                            <span className="text-slate-500 select-none">3</span>
                            <span>FROM {effectiveTable}</span>
                          </div>
                        </div>
                      </div>

                      {/* Database & Table Selectors */}
                      <div className="space-y-2">
                        <div>
                          <label className="block text-[10px] font-mono text-slate-400 mb-1 font-semibold">
                            Target Database Connection:
                          </label>
                          <select
                            value={effectiveDbId}
                            onChange={(e) => {
                              const newDbId = e.target.value;
                              const selDb = databases.find(d => d.id === newDbId);
                              const tbls = (selDb?.allowedTables && selDb.allowedTables.length > 0)
                                ? selDb.allowedTables
                                : (selDb?.availableTables || []);
                              const newTable = tbls[0] || 'transactions';
                              onUpdateNode({
                                ...selectedNode,
                                targetDbId: newDbId,
                                targetTable: newTable,
                                attachedDbConfigIds: [],
                                columnConfigurationIds: []
                              });
                            }}
                            className="w-full bg-[#091a22] border border-[#163848] rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none font-mono text-cyan-300 focus:border-[#00e5b3]"
                          >
                            {databases.length === 0 ? (
                              <option value="">Default Database</option>
                            ) : (
                              databases.map(db => (
                                <option key={db.id} value={db.id}>
                                  {db.name || db.id} ({db.type || 'postgres'})
                                </option>
                              ))
                            )}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono text-slate-400 mb-1 font-semibold">
                            Target Table / View:
                          </label>
                          {availableTables.length > 0 ? (
                            <select
                              value={effectiveTable}
                              onChange={(e) => {
                                onUpdateNode({
                                  ...selectedNode,
                                  targetTable: e.target.value,
                                  attachedDbConfigIds: [],
                                  columnConfigurationIds: []
                                });
                              }}
                              className="w-full bg-[#091a22] border border-[#163848] rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none font-mono text-emerald-300 focus:border-emerald-500"
                            >
                              {availableTables.map(t => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={selectedNode.targetTable || effectiveTable}
                              onChange={(e) => onUpdateNode({ ...selectedNode, targetTable: e.target.value })}
                              placeholder="e.g. transactions"
                              className="w-full bg-[#091a22] border border-[#163848] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                            />
                          )}
                        </div>
                      </div>

                      {/* Cardinality Policy */}
                      <div className="space-y-1.5 pt-1">
                        <label className="block text-[10px] font-mono text-cyan-400 font-bold">
                          Multi-Row Cardinality Policy:
                        </label>
                        <select
                          value={selectedNode.cardinalityPolicy || 'STRICT_SINGLE'}
                          onChange={(e) => onUpdateNode({ 
                            ...selectedNode, 
                            cardinalityPolicy: e.target.value as MultiRowCardinalityPolicy 
                          })}
                          className="w-full bg-[#091a22] border border-[#163848] rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none font-mono text-cyan-300 focus:border-cyan-500"
                        >
                          <option value="STRICT_SINGLE">STRICT_SINGLE (1:1 Exact Match)</option>
                          <option value="ONE_TO_MANY">ONE_TO_MANY (1:N Matches Allowed)</option>
                          <option value="EXPLICIT_LATEST">EXPLICIT_LATEST (Latest by Order Column)</option>
                          <option value="EXPLICIT_FIRST">EXPLICIT_FIRST (Earliest by Order Column)</option>
                          <option value="ALL_ROWS">ALL_ROWS (Process All Rows)</option>
                        </select>

                        {(selectedNode.cardinalityPolicy === 'EXPLICIT_LATEST' || selectedNode.cardinalityPolicy === 'EXPLICIT_FIRST') && (
                          <div className="pt-1">
                            <label className="block text-[10px] font-mono text-amber-400 mb-1 font-bold">
                              Order By Column (Mandatory):
                            </label>
                            <input
                              type="text"
                              value={selectedNode.orderByColumn || ''}
                              onChange={(e) => onUpdateNode({ ...selectedNode, orderByColumn: e.target.value })}
                              placeholder="e.g. created_at, timestamp, txn_time"
                              className="w-full bg-[#091a22] border border-amber-600/70 rounded-lg px-2.5 py-1.5 text-xs font-mono text-amber-200 focus:outline-none focus:border-amber-400"
                            />
                          </div>
                        )}

                        <div className="pt-1">
                          <label className="block text-[10px] font-mono text-slate-400 mb-1 font-semibold">
                            Aggregation Strategy:
                          </label>
                          <select
                            value={selectedNode.aggregationStrategy || 'NONE'}
                            onChange={(e) => onUpdateNode({ 
                              ...selectedNode, 
                              aggregationStrategy: e.target.value as AggregationStrategy 
                            })}
                            className="w-full bg-[#091a22] border border-[#163848] rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none font-mono text-slate-200 focus:border-[#00e5b3]"
                          >
                            <option value="NONE">NONE (No Aggregation)</option>
                            <option value="SUM">SUM (Sum Numeric Fields)</option>
                            <option value="COUNT">COUNT (Row Count)</option>
                            <option value="MIN">MIN (Minimum Value)</option>
                            <option value="MAX">MAX (Maximum Value)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Outputs Section matching screenshot */}
            {!isTerminal && (
              <div className="space-y-2">
                <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  Outputs
                </div>

                {/* PASS Output Accordion */}
                <div className="bg-[#091a22] border border-[#163848] rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setPassOpen(!passOpen)}
                    className="w-full px-3.5 py-2 flex items-center justify-between text-left text-xs font-bold text-white hover:bg-[#0c242e] transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-[#00e5b3] shadow-[0_0_6px_#00e5b3]"></span>
                      <span className="font-mono text-slate-200">PASS</span>
                    </div>
                    <ChevronDown size={14} className={`text-slate-400 transition-transform ${passOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {passOpen && (
                    <div className="p-3 border-t border-[#163848] bg-[#07151c] space-y-2">
                      <label className="block text-[10px] font-mono text-[#00e5b3] mb-1 font-bold">On PASS Action:</label>
                      <select
                        value={selectedNode.onPassAction || 'CONTINUE'}
                        onChange={(e) => onUpdateNode({ ...selectedNode, onPassAction: e.target.value as FlowchartOutputAction })}
                        className="w-full bg-[#091a22] border border-[#163848] rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none font-mono text-[#00e5b3] focus:border-[#00e5b3]"
                      >
                        <option value="CONTINUE">CONTINUE (Advance Downstream)</option>
                        <option value="STOP">STOP (Halt Pipeline)</option>
                        <option value="REPORT">REPORT (Add Intermediate Col)</option>
                      </select>
                      {selectedNode.onPassAction === 'REPORT' && (
                        <div className="space-y-2 pt-1 border-t border-[#163848]">
                          <div>
                            <label className="block text-[10px] font-mono text-slate-300 mb-1">Grid Header Title:</label>
                            <input
                              type="text"
                              value={selectedNode.reportColumnName || ''}
                              onChange={(e) => onUpdateNode({ ...selectedNode, reportColumnName: e.target.value })}
                              placeholder="e.g. Auth Pass Status"
                              className="w-full bg-[#091a22] border border-[#163848] rounded-lg px-2.5 py-1.5 text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-mono text-slate-300 mb-1">Standard Field:</label>
                            <select
                              value={selectedNode.reportField || ''}
                              onChange={(e) => onUpdateNode({ ...selectedNode, reportField: e.target.value })}
                              className="w-full bg-[#091a22] border border-[#163848] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                            >
                              <option value="">-- Select Field --</option>
                              {globalMappingService.getStandardFields().map(f => (
                                <option key={f.key} value={f.key}>{f.label} ({f.key})</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* FAIL Output Accordion */}
                <div className="bg-[#091a22] border border-[#163848] rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setFailOpen(!failOpen)}
                    className="w-full px-3.5 py-2 flex items-center justify-between text-left text-xs font-bold text-white hover:bg-[#0c242e] transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_6px_#ef4444]"></span>
                      <span className="font-mono text-slate-200">FAIL</span>
                    </div>
                    <ChevronDown size={14} className={`text-slate-400 transition-transform ${failOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {failOpen && (
                    <div className="p-3 border-t border-[#163848] bg-[#07151c] space-y-2">
                      <label className="block text-[10px] font-mono text-rose-400 mb-1 font-bold">On FAIL Action:</label>
                      <select
                        value={selectedNode.onFailAction || 'STOP'}
                        onChange={(e) => onUpdateNode({ ...selectedNode, onFailAction: e.target.value as FlowchartOutputAction })}
                        className="w-full bg-[#091a22] border border-[#163848] rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none font-mono text-rose-300 focus:border-rose-500"
                      >
                        <option value="STOP">STOP (Halt Pipeline)</option>
                        <option value="CONTINUE">CONTINUE (Advance Downstream)</option>
                        <option value="REPORT">REPORT (Add Intermediate Col)</option>
                      </select>
                      {selectedNode.onFailAction === 'REPORT' && (
                        <div className="space-y-2 pt-1 border-t border-[#163848]">
                          <div>
                            <label className="block text-[10px] font-mono text-slate-300 mb-1">Grid Header Title:</label>
                            <input
                              type="text"
                              value={selectedNode.reportColumnName || ''}
                              onChange={(e) => onUpdateNode({ ...selectedNode, reportColumnName: e.target.value })}
                              placeholder="e.g. Auth Error Code"
                              className="w-full bg-[#091a22] border border-[#163848] rounded-lg px-2.5 py-1.5 text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-mono text-slate-300 mb-1">Standard Field:</label>
                            <select
                              value={selectedNode.reportField || ''}
                              onChange={(e) => onUpdateNode({ ...selectedNode, reportField: e.target.value })}
                              className="w-full bg-[#091a22] border border-[#163848] rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                            >
                              <option value="">-- Select Field --</option>
                              {globalMappingService.getStandardFields().map(f => (
                                <option key={f.key} value={f.key}>{f.label} ({f.key})</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Logs Section matching screenshot */}
            <div className="space-y-2">
              <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-400">
                Logs
              </div>
              <div className="bg-[#091a22] border border-[#163848] rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setLogsOpen(!logsOpen)}
                  className="w-full px-3.5 py-2 flex items-center justify-between text-left text-xs font-bold text-white hover:bg-[#0c242e] transition cursor-pointer"
                >
                  <span className="text-slate-200">Execution Readiness</span>
                  <ChevronDown size={14} className={`text-slate-400 transition-transform ${logsOpen ? 'rotate-180' : ''}`} />
                </button>
                {logsOpen && (
                  <div className="p-3 border-t border-[#163848] bg-[#051c22] font-mono text-[10px] text-cyan-300/80 space-y-1">
                    <div>[STAGE] {selectedNode.type} :: {selectedNode.name}</div>
                    <div>[TARGET] {effectiveTable} on {selectedDbObj?.name || 'default'}</div>
                    <div>[RULES] {currentAttachedIds.length} attached rules</div>
                    <div className="text-[#00e5b3]">[STATE] Ready for pipeline execution</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Rules Tab Body: Database Column Configurations & Table Rules */
          <div className="p-4 space-y-4 text-xs flex-1">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-bold text-cyan-300 flex items-center space-x-1.5 text-[11px] font-mono uppercase">
                  <Sliders size={13} className="text-[#00e5b3]" />
                  <span>Column Rules ({currentAttachedIds.length})</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#072422] border border-[#00e5b3]/40 text-[#00e5b3] font-bold">
                  {currentAttachedIds.length} / {availableConfigs.length} Active
                </span>
              </div>

              <p className="text-[10px] text-slate-400 leading-tight">
                Attach explicit completeness, range, and format rules configured for <code className="text-[#00e5b3] font-mono">{effectiveTable}</code>:
              </p>

              {availableConfigs.length > 0 && (
                <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                  <button
                    type="button"
                    onClick={selectAllConfigs}
                    className="text-[10px] bg-[#072422] hover:bg-[#093532] text-[#00e5b3] border border-[#00e5b3]/50 px-2 py-0.5 rounded-lg font-mono font-semibold transition cursor-pointer"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={clearAllConfigs}
                    className="text-[10px] bg-[#091a22] hover:bg-[#0c242e] text-slate-400 border border-[#163848] px-2 py-0.5 rounded-lg font-mono transition cursor-pointer"
                  >
                    Clear All
                  </button>
                  {workflowAttachedDbConfigIds && workflowAttachedDbConfigIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateNode({
                          ...selectedNode,
                          attachedDbConfigIds: workflowAttachedDbConfigIds,
                          columnConfigurationIds: workflowAttachedDbConfigIds
                        });
                      }}
                      className="text-[10px] bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/80 px-2 py-0.5 rounded-lg font-mono font-semibold transition cursor-pointer flex items-center gap-1"
                      title="Inherit accepted workflow rules for this table"
                    >
                      <ShieldCheck size={10} />
                      <span>Inherit Workflow ({workflowAttachedDbConfigIds.length})</span>
                    </button>
                  )}
                </div>
              )}

              {loadingConfigs ? (
                <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
                  <RefreshCw size={12} className="animate-spin text-cyan-400" />
                  <span>Loading table configurations...</span>
                </div>
              ) : availableConfigs.length === 0 ? (
                <div className="p-3 bg-[#091a22] border border-[#163848] rounded-xl text-center space-y-1">
                  <p className="text-[11px] text-slate-400">
                    No column rules configured yet for <code className="text-cyan-300 font-mono">{effectiveTable}</code>.
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Create completeness, range, or duplicate rules in <strong>Database Column Configurations</strong> to bind them here.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
                  {availableConfigs.map(cfg => {
                    const isAttached = currentAttachedIds.includes(cfg.id);
                    const badge = getRuleTypeBadge(cfg.ruleType);
                    return (
                      <div
                        key={cfg.id}
                        onClick={() => toggleConfigId(cfg.id)}
                        className={`p-2.5 rounded-xl border text-[11px] cursor-pointer transition flex items-start gap-2.5 ${
                          isAttached
                            ? 'bg-[#072422] border-[#00e5b3]/70 text-white shadow-xs'
                            : 'bg-[#091a22] border-[#163848] text-slate-400 hover:border-cyan-500/50 hover:bg-[#0c242e]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isAttached}
                          onChange={() => {}}
                          className="mt-0.5 w-3.5 h-3.5 rounded bg-[#091a22] border-[#163848] text-[#00e5b3] focus:ring-0 cursor-pointer shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className={`font-semibold truncate text-[11px] ${isAttached ? 'text-white' : 'text-slate-300'}`}>
                              {cfg.name}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              {cfg.statusBehavior === 'REPORT_ONLY' && (
                                <span className="text-[7px] font-mono uppercase px-1 py-0.2 rounded bg-purple-950/80 text-purple-300 border border-purple-500/40">
                                  REPORT ONLY
                                </span>
                              )}
                              <span className={`text-[8px] font-mono uppercase px-1 py-0.2 rounded border ${badge.bg}`}>
                                {badge.label}
                              </span>
                            </div>
                          </div>
                          <div className="text-[9px] text-slate-400 truncate font-mono">
                            {cfg.columns?.map(c => c.columnName).join(', ') || cfg.tableName}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer Delete Action */}
        <div className="p-4 border-t border-[#163848] bg-[#09171f] sticky bottom-0">
          <button
            type="button"
            onClick={() => onDeleteNode(selectedNode.id)}
            className="w-full py-2 px-3 bg-[#271115] hover:bg-[#38161c] border border-rose-500/50 text-rose-300 rounded-xl text-xs font-mono font-bold flex items-center justify-center space-x-2 transition cursor-pointer shadow-xs"
          >
            <Trash2 size={13} />
            <span>Delete Block</span>
          </button>
        </div>
      </aside>
    );
  }

  // Case 2: Inspecting a Connection Wire
  if (selectedConnection) {
    return (
      <aside 
        className="w-80 bg-[#071318] border-l border-[#163848] flex flex-col h-full text-slate-200 overflow-y-auto font-sans"
        aria-label="Connection Wire Inspector"
      >
        <div className="p-3.5 border-b border-[#163848] flex items-center justify-between bg-[#09171f] sticky top-0 z-10">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-[#092b3a] border border-cyan-500/50 text-cyan-300 rounded-lg shadow-xs">
              <Link2 size={16} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Wire Outcome
              </h3>
              <p className="text-[10px] text-teal-400 font-mono">
                Port: {selectedConnection.fromPort.toUpperCase()}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseConnection}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-[#163848] transition cursor-pointer"
            title="Close Inspector"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3.5 text-xs flex-1">
          <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
            Configure transaction routing behavior when evaluation traverses this wire:
          </p>

          <div className="space-y-2">
            {[
              {
                id: 'CONTINUE' as const,
                label: 'Continue Downstream',
                desc: 'Progress directly to the connected downstream node.',
                badge: '● PASS'
              },
              {
                id: 'STOP' as const,
                label: 'Stop Pipeline',
                desc: 'Halt transaction execution here and mark as FLAGGED.',
                badge: '● HALT'
              },
              {
                id: 'REPORT' as const,
                label: 'Report & Continue',
                desc: 'Project this stage result as an extra column in Investigation Grid.',
                badge: '● REPORT'
              }
            ].map(opt => {
              const isSelected = selectedConnection.action === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => onUpdateConnection({ ...selectedConnection, action: opt.id, label: opt.label })}
                  className={`p-3 rounded-xl border transition cursor-pointer space-y-1 ${
                    isSelected
                      ? 'bg-[#072422] border-[#00e5b3] text-white shadow-xs'
                      : 'bg-[#091a22] border-[#163848] text-slate-400 hover:border-cyan-500/50 hover:bg-[#0c242e]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-white">{opt.label}</span>
                    <span className={`text-[10px] font-mono font-bold ${
                      opt.id === 'CONTINUE' ? 'text-[#00e5b3]' :
                      opt.id === 'STOP' ? 'text-rose-400' : 'text-purple-400'
                    }`}>
                      {opt.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">{opt.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-[#163848] bg-[#09171f] sticky bottom-0">
          <button
            type="button"
            onClick={() => onDeleteConnection(selectedConnection.id)}
            className="w-full py-2 px-3 bg-[#271115] hover:bg-[#38161c] border border-rose-500/50 text-rose-300 rounded-xl text-xs font-mono font-bold flex items-center justify-center space-x-2 transition cursor-pointer shadow-xs"
          >
            <Unlink size={13} />
            <span>Delete Wire</span>
          </button>
        </div>
      </aside>
    );
  }

  // Case 3: Workflow-Level Database Scope & Configuration Acceptance Inspector
  const currentWfAttachedIds = Array.isArray(workflowAttachedDbConfigIds) ? workflowAttachedDbConfigIds : [];
  const selectedWfDbObj = databases.find(d => d.id === effectiveDbId);
  const availableWfTables = (selectedWfDbObj?.allowedTables && selectedWfDbObj.allowedTables.length > 0)
    ? selectedWfDbObj.allowedTables
    : (selectedWfDbObj?.availableTables || (selectedWfDbObj?.metadata?.tables) || []);

  const toggleWfConfigId = (cfgId: string) => {
    if (!onUpdateWorkflowDbConfig) return;
    const isAttached = currentWfAttachedIds.includes(cfgId);
    const nextIds = isAttached
      ? currentWfAttachedIds.filter(id => id !== cfgId)
      : [...currentWfAttachedIds, cfgId];
    onUpdateWorkflowDbConfig({ attachedDbConfigIds: nextIds });
  };

  const selectAllWfConfigs = () => {
    if (!onUpdateWorkflowDbConfig) return;
    const allIds = availableConfigs.map(c => c.id);
    onUpdateWorkflowDbConfig({ attachedDbConfigIds: allIds });
  };

  const clearAllWfConfigs = () => {
    if (!onUpdateWorkflowDbConfig) return;
    onUpdateWorkflowDbConfig({ attachedDbConfigIds: [] });
  };

  return (
    <aside 
      className="w-80 bg-[#071318] border-l border-[#163848] flex flex-col h-full text-slate-200 overflow-y-auto font-sans"
      aria-label="Workflow Properties Inspector"
    >
      {/* Panel Header */}
      <div className="p-3.5 border-b border-[#163848] flex items-center justify-between bg-[#09171f] sticky top-0 z-10">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#181c38] border border-purple-500/50 flex items-center justify-center text-purple-300 shadow-xs">
            <Database size={14} />
          </div>
          <div>
            <span className="font-bold text-xs text-white block">Workflow DB Governance</span>
            <span className="text-[10px] font-mono text-cyan-400">Scope &amp; Rule Acceptance</span>
          </div>
        </div>
        {onCloseInspector && (
          <button
            type="button"
            onClick={onCloseInspector}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-[#163848] transition cursor-pointer"
            title="Close Panel"
          >
            <X size={15} />
          </button>
        )}
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Workflow Info Banner */}
        <div className="p-3 bg-[#091a22] border border-[#163848] rounded-xl space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-white truncate max-w-[170px]" title={workflowName}>
              {workflowName || 'Workflow Pipeline'}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#072422] text-[#00e5b3] border border-[#00e5b3]/40">
              {workflowCategory || 'Settlement'}
            </span>
          </div>
          {workflowDescription && (
            <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
              {workflowDescription}
            </p>
          )}
        </div>

        {/* Database & Table Scope Selectors */}
        <div className="p-3 bg-[#091a22] border border-[#163848] rounded-xl space-y-2.5">
          <span className="font-bold text-slate-300 flex items-center space-x-1.5 text-[11px] font-mono uppercase">
            <Database size={13} className="text-cyan-400" />
            <span>Target Database Scope</span>
          </span>

          <div className="space-y-2">
            <div>
              <label className="block text-[10px] font-mono text-slate-400 mb-1 font-semibold">
                Target Database Connection:
              </label>
              <select
                value={effectiveDbId}
                onChange={(e) => {
                  const newDbId = e.target.value;
                  const selDb = databases.find(d => d.id === newDbId);
                  const tbls = (selDb?.allowedTables && selDb.allowedTables.length > 0)
                    ? selDb.allowedTables
                    : (selDb?.availableTables || (selDb?.metadata?.tables) || []);
                  const newTable = tbls[0] || '';
                  if (onUpdateWorkflowDbConfig) {
                    onUpdateWorkflowDbConfig({
                      targetDbId: newDbId,
                      targetTable: newTable,
                      attachedDbConfigIds: []
                    });
                  }
                }}
                className="w-full bg-[#071318] border border-[#163848] rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none font-mono text-cyan-300 focus:border-[#00e5b3]"
              >
                {databases.length === 0 ? (
                  <option value="">(No Database Configured)</option>
                ) : (
                  databases.map(db => (
                    <option key={db.id} value={db.id}>
                      {db.name || db.database || db.id} ({db.type || 'postgres'})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-slate-400 mb-1 font-semibold">
                Scope Table / View:
              </label>
              {availableWfTables.length > 0 ? (
                <select
                  value={effectiveTable}
                  onChange={(e) => {
                    if (onUpdateWorkflowDbConfig) {
                      onUpdateWorkflowDbConfig({
                        targetTable: e.target.value,
                        attachedDbConfigIds: []
                      });
                    }
                  }}
                  className="w-full bg-[#071318] border border-[#163848] rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none font-mono text-emerald-300 focus:border-emerald-500"
                >
                  <option value="">(Select Table)</option>
                  {availableWfTables.map((t: string) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={effectiveTable}
                  onChange={(e) => {
                    if (onUpdateWorkflowDbConfig) {
                      onUpdateWorkflowDbConfig({
                        targetTable: e.target.value
                      });
                    }
                  }}
                  placeholder="e.g. core_transactions"
                  className="w-full bg-[#071318] border border-[#163848] rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                />
              )}
            </div>
          </div>
        </div>

        {/* Anti-Contamination Mandate Banner */}
        <div className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-200/90 text-[10px] flex items-start gap-2 leading-relaxed">
          <ShieldCheck size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong>Anti-Contamination Mandate (§10 &amp; Rule 21):</strong> Workflows only apply explicitly accepted database column configurations. Table-level rules are strictly excluded unless checked below.
          </span>
        </div>

        {/* Workflow-Level Column Configuration Acceptance */}
        <div className="p-3 bg-[#091a22] border border-[#163848] rounded-xl space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-cyan-300 flex items-center space-x-1.5 text-[11px] font-mono uppercase">
              <Sliders size={13} className="text-[#00e5b3]" />
              <span>Accepted Table Rules</span>
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#072422] border border-[#00e5b3]/40 text-[#00e5b3] font-bold">
              {currentWfAttachedIds.length} / {availableConfigs.length} Accepted
            </span>
          </div>

          <p className="text-[10px] text-slate-400 leading-tight">
            Select which database column configurations registered on <code className="text-[#00e5b3] font-mono">{effectiveTable || 'target table'}</code> apply to this workflow:
          </p>

          {availableConfigs.length > 0 && onUpdateWorkflowDbConfig && (
            <div className="flex items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={selectAllWfConfigs}
                className="text-[10px] bg-[#072422] hover:bg-[#093532] text-[#00e5b3] border border-[#00e5b3]/50 px-2 py-0.5 rounded-lg font-mono font-semibold transition cursor-pointer"
              >
                Accept All
              </button>
              <button
                type="button"
                onClick={clearAllWfConfigs}
                className="text-[10px] bg-[#091a22] hover:bg-[#0c242e] text-slate-400 border border-[#163848] px-2 py-0.5 rounded-lg font-mono transition cursor-pointer"
              >
                Clear All
              </button>
            </div>
          )}

          {loadingConfigs ? (
            <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
              <RefreshCw size={12} className="animate-spin text-cyan-400" />
              <span>Loading table column rules...</span>
            </div>
          ) : availableConfigs.length === 0 ? (
            <div className="p-3 bg-[#071318] border border-[#163848] rounded-xl text-center space-y-1">
              <p className="text-[11px] text-slate-400">
                No column rules configured yet for <code className="text-[#00e5b3] font-mono">{effectiveTable || 'this table'}</code>.
              </p>
              <p className="text-[10px] text-slate-500">
                Create rules in <strong>Database Column Configurations</strong> to accept them here.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {availableConfigs.map(cfg => {
                const isAttached = currentWfAttachedIds.includes(cfg.id);
                const badge = getRuleTypeBadge(cfg.ruleType);
                const colNames = Array.isArray(cfg.columns) ? cfg.columns.map(c => c.columnName).filter(Boolean) : [];

                return (
                  <div
                    key={cfg.id}
                    onClick={() => toggleWfConfigId(cfg.id)}
                    className={`p-2 rounded-xl border text-xs cursor-pointer transition select-none ${
                      isAttached
                        ? 'bg-[#072422] border-[#00e5b3]/70 text-white shadow-xs'
                        : 'bg-[#071318] border-[#163848] text-slate-400 hover:border-cyan-500/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="flex items-center space-x-1.5 min-w-0">
                        {isAttached ? (
                          <CheckSquare size={13} className="text-[#00e5b3] shrink-0" />
                        ) : (
                          <Square size={13} className="text-slate-600 shrink-0" />
                        )}
                        <span className="font-semibold text-xs text-white truncate" title={cfg.name}>
                          {cfg.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {cfg.statusBehavior === 'REPORT_ONLY' && (
                          <span className="text-[7px] font-mono uppercase px-1 py-0.2 rounded bg-purple-950/80 text-purple-300 border border-purple-500/40">
                            REPORT ONLY
                          </span>
                        )}
                        <span className={`text-[9px] font-mono px-1 py-0.2 rounded border shrink-0 ${badge.bg}`}>
                          {badge.label}
                        </span>
                      </div>
                    </div>

                    {colNames.length > 0 && (
                      <div className="mt-1 pl-5 text-[10px] font-mono text-slate-400 truncate" title={colNames.join(', ')}>
                        cols: {colNames.join(', ')}
                      </div>
                    )}

                    <div className="mt-1 pl-5 flex items-center gap-1.5 text-[9px] font-mono">
                      <span className={`px-1 py-0.2 rounded border ${
                        cfg.violationAction === 'STOP' ? 'bg-[#271115] border-rose-500/50 text-rose-300' :
                        cfg.violationAction === 'FLAG' ? 'bg-amber-950/80 border-amber-800 text-amber-300' :
                        'bg-[#072422] border-[#00e5b3]/40 text-[#00e5b3]'
                      }`}>
                        {cfg.violationAction}
                      </span>
                      <span className="text-slate-500">•</span>
                      <span className="text-slate-400">{cfg.severity}</span>
                      {cfg.filterConditions && cfg.filterConditions.length > 0 && (
                        <>
                          <span className="text-slate-500">•</span>
                          <span className="text-cyan-400">{cfg.filterConditions.length} filters</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Downstream Stage Inheritance Guidance */}
        <div className="p-3 bg-[#091a22] border border-[#163848] rounded-xl space-y-1 text-slate-400">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300 font-mono">
            <Info size={12} className="text-cyan-400 shrink-0" />
            <span>Stage Inheritance</span>
          </div>
          <p className="text-[10px] leading-relaxed">
            Flowchart nodes targeting <code className="text-[#00e5b3] font-mono">{effectiveTable || 'this table'}</code> automatically inherit accepted rules unless individual stages specify custom overrides.
          </p>
        </div>
      </div>
    </aside>
  );
};
