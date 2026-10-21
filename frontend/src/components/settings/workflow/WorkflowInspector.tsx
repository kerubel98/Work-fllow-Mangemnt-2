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
        className="w-80 bg-white border-l border-slate-200 flex flex-col h-full text-slate-800 overflow-y-auto font-sans shadow-sm"
        aria-label="Node Inspector"
      >
        {/* Panel Header matching 03_workflow_studio.png */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="min-w-0 flex-1 mr-2">
            <span className="text-[11px] font-medium text-slate-400 block">Selected block</span>
            <div className="flex items-center gap-2 mt-0.5">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight truncate">
                {selectedNode.name || 'Block Inspector'}
              </h3>
              <span className="bg-orange-50 text-[#F27421] border border-orange-200 text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0">
                {selectedNode.type === 'VALIDATION' || selectedNode.type === 'VALIDATION_BOX' ? 'Condition check' : selectedNode.type}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseNode}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
            title="Close Inspector"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tab Navigation: Config | Rules */}
        <div className="flex items-center border-b border-slate-200 bg-white px-4">
          <button
            type="button"
            onClick={() => setInspectorTab('config')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
              inspectorTab === 'config'
                ? 'border-[#F27421] text-[#F27421] font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Config
          </button>
          <button
            type="button"
            onClick={() => setInspectorTab('rules')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition cursor-pointer ${
              inspectorTab === 'rules'
                ? 'border-[#F27421] text-[#F27421] font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            Rules {currentAttachedIds.length > 0 && `(${currentAttachedIds.length})`}
          </button>
        </div>

        {inspectorTab === 'config' ? (
          <div className="p-4 space-y-4 text-xs flex-1">
            {/* Summary Metadata Key-Value List */}
            <div className="space-y-1.5 py-1 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="text-slate-500">Node Type:</span>
                <span className="font-bold text-slate-800">
                  {selectedNode.type === 'VALIDATION' ? 'VALIDATION_BOX' : selectedNode.type}
                </span>
              </div>
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="text-slate-500">Validation Box:</span>
                <span className="text-slate-800 font-mono truncate max-w-[150px]">
                  {boundBox?.name || selectedNode.name || 'auth_log_tab'}
                </span>
              </div>
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="text-slate-500">Target Table:</span>
                <span className="text-[#F27421] font-mono font-bold truncate max-w-[150px]">
                  {effectiveTable || 'tran_log_tab'}
                </span>
              </div>
            </div>

            {/* Editable Block Label */}
            <div className="space-y-1.5">
              <label className="block text-[11px] font-semibold text-slate-700">
                Label
              </label>
              <input
                type="text"
                value={selectedNode.name || ''}
                onChange={(e) => onUpdateNode({ ...selectedNode, name: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#F27421] font-sans shadow-2xs"
              />
            </div>

            {/* DB Configuration Section with SQL Box */}
            {!isTerminal && (
              <div className="space-y-2.5">
                {/* Collapsible Rule Definition Accordion */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setRuleDefOpen(!ruleDefOpen)}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between text-left text-xs font-bold text-slate-800 hover:bg-slate-50 transition cursor-pointer"
                  >
                    <span className="text-slate-800">Rule definition</span>
                    <ChevronDown size={14} className={`text-slate-500 transition-transform ${ruleDefOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {ruleDefOpen && (
                    <div className="p-3 border-t border-slate-200 space-y-3 bg-white">
                      {/* Dark Code Block with line numbers matching 03_workflow_studio.png */}
                      <div>
                        <div className="bg-[#0F142A] border border-slate-800 rounded-xl p-3 font-mono text-xs text-slate-200 leading-relaxed shadow-inner space-y-1">
                          <div className="flex gap-3">
                            <span className="text-slate-500 select-none w-3">1</span>
                            <span>SELECT ({selectedDbObj?.type ? selectedDbObj.type.toUpperCase() : 'MYSQL'})</span>
                          </div>
                          <div className="flex gap-3">
                            <span className="text-slate-500 select-none w-3">2</span>
                            <span>TARGET: <span className="text-amber-400">{effectiveTable}</span></span>
                          </div>
                          <div className="flex gap-3">
                            <span className="text-slate-500 select-none w-3">3</span>
                            <span>FROM {effectiveTable}</span>
                          </div>
                        </div>
                      </div>

                      {/* Database & Table Selectors */}
                      <div className="space-y-2.5">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Database connection
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
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none font-mono text-slate-800 focus:border-[#F27421] shadow-2xs"
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
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Table / view
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
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none font-mono text-slate-800 focus:border-[#F27421] shadow-2xs"
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
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#F27421] font-mono shadow-2xs"
                            />
                          )}
                        </div>
                      </div>

                      {/* Row matching (Cardinality Policy) */}
                      <div className="space-y-1.5 pt-1">
                        <label className="block text-[11px] font-semibold text-slate-700">
                          Row matching
                        </label>
                        <select
                          value={selectedNode.cardinalityPolicy || 'STRICT_SINGLE'}
                          onChange={(e) => onUpdateNode({ 
                            ...selectedNode, 
                            cardinalityPolicy: e.target.value as MultiRowCardinalityPolicy 
                          })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none font-mono text-slate-800 focus:border-[#F27421] shadow-2xs"
                        >
                          <option value="STRICT_SINGLE">Strict single (1:1 Exact match)</option>
                          <option value="ONE_TO_MANY">One-to-many (1:N matches allowed)</option>
                          <option value="EXPLICIT_LATEST">Explicit latest (Latest by order column)</option>
                          <option value="EXPLICIT_FIRST">Explicit first (Earliest by order column)</option>
                          <option value="ALL_ROWS">All rows (Process all rows)</option>
                        </select>

                        {(selectedNode.cardinalityPolicy === 'EXPLICIT_LATEST' || selectedNode.cardinalityPolicy === 'EXPLICIT_FIRST') && (
                          <div className="pt-1">
                            <label className="block text-[10px] font-mono text-amber-600 mb-1 font-bold">
                              Order By Column (Mandatory):
                            </label>
                            <input
                              type="text"
                              value={selectedNode.orderByColumn || ''}
                              onChange={(e) => onUpdateNode({ ...selectedNode, orderByColumn: e.target.value })}
                              placeholder="e.g. created_at, timestamp, txn_time"
                              className="w-full bg-white border border-amber-300 rounded-xl px-3 py-1.5 text-xs font-mono text-amber-900 focus:outline-none focus:border-amber-500 shadow-2xs"
                            />
                          </div>
                        )}

                        <div className="pt-1">
                          <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                            Aggregation strategy
                          </label>
                          <select
                            value={selectedNode.aggregationStrategy || 'NONE'}
                            onChange={(e) => onUpdateNode({ 
                              ...selectedNode, 
                              aggregationStrategy: e.target.value as AggregationStrategy 
                            })}
                            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none font-mono text-slate-800 focus:border-[#F27421] shadow-2xs"
                          >
                            <option value="NONE">NONE (No aggregation)</option>
                            <option value="SUM">SUM (Sum numeric fields)</option>
                            <option value="COUNT">COUNT (Row count)</option>
                            <option value="MIN">MIN (Minimum value)</option>
                            <option value="MAX">MAX (Maximum value)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Outputs Section */}
            {!isTerminal && (
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Outputs
                </div>

                {/* PASS Output Accordion */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setPassOpen(!passOpen)}
                    className="w-full px-3.5 py-2 flex items-center justify-between text-left text-xs font-bold text-slate-800 hover:bg-slate-50 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span className="font-mono text-slate-800">PASS</span>
                    </div>
                    <ChevronDown size={14} className={`text-slate-400 transition-transform ${passOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {passOpen && (
                    <div className="p-3 border-t border-slate-200 bg-white space-y-2">
                      <label className="block text-[10px] font-mono text-emerald-700 mb-1 font-bold">On PASS Action:</label>
                      <select
                        value={selectedNode.onPassAction || 'CONTINUE'}
                        onChange={(e) => onUpdateNode({ ...selectedNode, onPassAction: e.target.value as FlowchartOutputAction })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none font-mono text-emerald-700 focus:border-emerald-500 shadow-2xs"
                      >
                        <option value="CONTINUE">CONTINUE (Advance Downstream)</option>
                        <option value="STOP">STOP (Halt Pipeline)</option>
                        <option value="REPORT">REPORT (Add Intermediate Col)</option>
                      </select>
                      {selectedNode.onPassAction === 'REPORT' && (
                        <div className="space-y-2 pt-1 border-t border-slate-200">
                          <div>
                            <label className="block text-[10px] font-mono text-slate-600 mb-1">Grid Header Title:</label>
                            <input
                              type="text"
                              value={selectedNode.reportColumnName || ''}
                              onChange={(e) => onUpdateNode({ ...selectedNode, reportColumnName: e.target.value })}
                              placeholder="e.g. Auth Pass Status"
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-mono text-slate-600 mb-1">Standard Field:</label>
                            <select
                              value={selectedNode.reportField || ''}
                              onChange={(e) => onUpdateNode({ ...selectedNode, reportField: e.target.value })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-mono"
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
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <button
                    type="button"
                    onClick={() => setFailOpen(!failOpen)}
                    className="w-full px-3.5 py-2 flex items-center justify-between text-left text-xs font-bold text-slate-800 hover:bg-slate-50 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                      <span className="font-mono text-slate-800">FAIL</span>
                    </div>
                    <ChevronDown size={14} className={`text-slate-400 transition-transform ${failOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {failOpen && (
                    <div className="p-3 border-t border-slate-200 bg-white space-y-2">
                      <label className="block text-[10px] font-mono text-rose-700 mb-1 font-bold">On FAIL Action:</label>
                      <select
                        value={selectedNode.onFailAction || 'STOP'}
                        onChange={(e) => onUpdateNode({ ...selectedNode, onFailAction: e.target.value as FlowchartOutputAction })}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none font-mono text-rose-700 focus:border-rose-500 shadow-2xs"
                      >
                        <option value="STOP">STOP (Halt Pipeline)</option>
                        <option value="CONTINUE">CONTINUE (Advance Downstream)</option>
                        <option value="REPORT">REPORT (Add Intermediate Col)</option>
                      </select>
                      {selectedNode.onFailAction === 'REPORT' && (
                        <div className="space-y-2 pt-1 border-t border-slate-200">
                          <div>
                            <label className="block text-[10px] font-mono text-slate-600 mb-1">Grid Header Title:</label>
                            <input
                              type="text"
                              value={selectedNode.reportColumnName || ''}
                              onChange={(e) => onUpdateNode({ ...selectedNode, reportColumnName: e.target.value })}
                              placeholder="e.g. Auth Error Code"
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-mono text-slate-600 mb-1">Standard Field:</label>
                            <select
                              value={selectedNode.reportField || ''}
                              onChange={(e) => onUpdateNode({ ...selectedNode, reportField: e.target.value })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 font-mono"
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

            {/* Logs Section */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Logs
              </div>
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                <button
                  type="button"
                  onClick={() => setLogsOpen(!logsOpen)}
                  className="w-full px-3.5 py-2 flex items-center justify-between text-left text-xs font-bold text-slate-800 hover:bg-slate-50 transition cursor-pointer"
                >
                  <span className="text-slate-800">Execution readiness</span>
                  <ChevronDown size={14} className={`text-slate-400 transition-transform ${logsOpen ? 'rotate-180' : ''}`} />
                </button>
                {logsOpen && (
                  <div className="p-3 border-t border-slate-200 bg-[#0F142A] font-mono text-[10px] text-slate-300 space-y-1">
                    <div>[STAGE] {selectedNode.type} :: {selectedNode.name}</div>
                    <div>[TARGET] {effectiveTable} on {selectedDbObj?.name || 'default'}</div>
                    <div>[RULES] {currentAttachedIds.length} attached rules</div>
                    <div className="text-emerald-400">[STATE] Ready for pipeline execution</div>
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
                <span className="font-bold text-slate-800 flex items-center space-x-1.5 text-[11px] font-mono uppercase">
                  <Sliders size={13} className="text-[#F27421]" />
                  <span>Column Rules ({currentAttachedIds.length})</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-[#F27421] font-bold">
                  {currentAttachedIds.length} / {availableConfigs.length} Active
                </span>
              </div>

              <p className="text-[11px] text-slate-500 leading-tight">
                Attach explicit completeness, range, and format rules configured for <code className="text-slate-800 font-mono font-bold">{effectiveTable}</code>:
              </p>

              {availableConfigs.length > 0 && (
                <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                  <button
                    type="button"
                    onClick={selectAllConfigs}
                    className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-2 py-0.5 rounded-lg font-mono font-semibold transition cursor-pointer"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={clearAllConfigs}
                    className="text-[10px] bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-lg font-mono transition cursor-pointer"
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
                      className="text-[10px] bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-lg font-mono font-semibold transition cursor-pointer flex items-center gap-1"
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
                  <RefreshCw size={12} className="animate-spin text-[#F27421]" />
                  <span>Loading table configurations...</span>
                </div>
              ) : availableConfigs.length === 0 ? (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-1">
                  <p className="text-[11px] text-slate-600">
                    No column rules configured yet for <code className="text-slate-800 font-mono font-bold">{effectiveTable}</code>.
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
                        className={`p-2.5 rounded-xl border text-[11px] cursor-pointer transition flex items-start gap-2.5 shadow-2xs ${
                          isAttached
                            ? 'bg-orange-50/40 border-[#F27421] text-slate-900'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isAttached}
                          onChange={() => {}}
                          className="mt-0.5 w-3.5 h-3.5 rounded border-slate-300 text-[#F27421] focus:ring-[#F27421] cursor-pointer shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <span className={`font-semibold truncate text-[11px] ${isAttached ? 'text-slate-900 font-bold' : 'text-slate-700'}`}>
                              {cfg.name}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              {cfg.statusBehavior === 'REPORT_ONLY' && (
                                <span className="text-[7px] font-mono uppercase px-1 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200">
                                  REPORT ONLY
                                </span>
                              )}
                              <span className={`text-[8px] font-mono uppercase px-1 py-0.2 rounded border ${badge.bg}`}>
                                {badge.label}
                              </span>
                            </div>
                          </div>
                          <div className="text-[9px] text-slate-500 truncate font-mono">
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
        <div className="p-4 border-t border-slate-200 bg-white sticky bottom-0">
          <button
            type="button"
            onClick={() => onDeleteNode(selectedNode.id)}
            className="w-full py-2.5 px-3 bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-xs font-sans font-bold flex items-center justify-center space-x-2 transition cursor-pointer shadow-2xs"
          >
            <Trash2 size={13} />
            <span>Delete block</span>
          </button>
        </div>
      </aside>
    );
  }

  // Case 2: Inspecting a Connection Wire
  if (selectedConnection) {
    return (
      <aside 
        className="w-80 bg-white border-l border-slate-200 flex flex-col h-full text-slate-800 overflow-y-auto font-sans shadow-sm"
        aria-label="Connection Wire Inspector"
      >
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-orange-50 border border-orange-200 text-[#F27421] rounded-lg shadow-2xs">
              <Link2 size={16} />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
                Wire Outcome
              </h3>
              <p className="text-[10px] text-slate-500 font-mono">
                Port: {selectedConnection.fromPort.toUpperCase()}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseConnection}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
            title="Close Inspector"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3.5 text-xs flex-1">
          <p className="text-[11px] text-slate-500 leading-relaxed font-sans">
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
                  className={`p-3 rounded-xl border transition cursor-pointer space-y-1 shadow-2xs ${
                    isSelected
                      ? 'bg-orange-50/50 border-[#F27421] text-slate-900'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900">{opt.label}</span>
                    <span className={`text-[10px] font-mono font-bold ${
                      opt.id === 'CONTINUE' ? 'text-emerald-600' :
                      opt.id === 'STOP' ? 'text-rose-600' : 'text-purple-600'
                    }`}>
                      {opt.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">{opt.desc}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 bg-white sticky bottom-0">
          <button
            type="button"
            onClick={() => onDeleteConnection(selectedConnection.id)}
            className="w-full py-2.5 px-3 bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-xs font-sans font-bold flex items-center justify-center space-x-2 transition cursor-pointer shadow-2xs"
          >
            <Unlink size={13} />
            <span>Delete wire</span>
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
      className="w-80 bg-white border-l border-slate-200 flex flex-col h-full text-slate-800 overflow-y-auto font-sans shadow-sm"
      aria-label="Workflow Properties Inspector"
    >
      {/* Panel Header */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white sticky top-0 z-10">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center text-[#F27421] shadow-2xs">
            <Database size={15} />
          </div>
          <div>
            <span className="font-bold text-xs text-slate-900 block">Workflow DB Governance</span>
            <span className="text-[10px] font-mono text-slate-500">Scope &amp; Rule Acceptance</span>
          </div>
        </div>
        {onCloseInspector && (
          <button
            type="button"
            onClick={onCloseInspector}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
            title="Close Panel"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="p-4 space-y-4 flex-1">
        {/* Workflow Info Banner */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-xs text-slate-900 truncate max-w-[170px]" title={workflowName}>
              {workflowName || 'Workflow Pipeline'}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-white text-[#F27421] border border-orange-200 shadow-2xs">
              {workflowCategory || 'Settlement'}
            </span>
          </div>
          {workflowDescription && (
            <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
              {workflowDescription}
            </p>
          )}
        </div>

        {/* Database & Table Scope Selectors */}
        <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2.5 shadow-2xs">
          <span className="font-bold text-slate-800 flex items-center space-x-1.5 text-[11px] font-mono uppercase">
            <Database size={13} className="text-[#F27421]" />
            <span>Target Database Scope</span>
          </span>

          <div className="space-y-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
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
                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none font-mono text-slate-800 focus:border-[#F27421] shadow-2xs"
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
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
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
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none font-mono text-slate-800 focus:border-[#F27421] shadow-2xs"
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
                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-[#F27421] font-mono shadow-2xs"
                />
              )}
            </div>
          </div>
        </div>

        {/* Anti-Contamination Mandate Banner */}
        <div className="p-2.5 rounded-xl bg-orange-50/50 border border-orange-200 text-orange-950 text-[10px] flex items-start gap-2 leading-relaxed">
          <ShieldCheck size={14} className="text-[#F27421] shrink-0 mt-0.5" />
          <span>
            <strong>Anti-Contamination Mandate (§10 &amp; Rule 21):</strong> Workflows only apply explicitly accepted database column configurations. Table-level rules are strictly excluded unless checked below.
          </span>
        </div>

        {/* Workflow-Level Column Configuration Acceptance */}
        <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800 flex items-center space-x-1.5 text-[11px] font-mono uppercase">
              <Sliders size={13} className="text-[#F27421]" />
              <span>Accepted Table Rules</span>
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-orange-50 border border-orange-200 text-[#F27421] font-bold">
              {currentWfAttachedIds.length} / {availableConfigs.length} Accepted
            </span>
          </div>

          <p className="text-[11px] text-slate-500 leading-tight">
            Select which database column configurations registered on <code className="text-slate-800 font-mono font-bold">{effectiveTable || 'target table'}</code> apply to this workflow:
          </p>

          {availableConfigs.length > 0 && onUpdateWorkflowDbConfig && (
            <div className="flex items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={selectAllWfConfigs}
                className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-2 py-0.5 rounded-lg font-mono font-semibold transition cursor-pointer"
              >
                Accept All
              </button>
              <button
                type="button"
                onClick={clearAllWfConfigs}
                className="text-[10px] bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-lg font-mono transition cursor-pointer"
              >
                Clear All
              </button>
            </div>
          )}

          {loadingConfigs ? (
            <div className="py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5">
              <RefreshCw size={12} className="animate-spin text-[#F27421]" />
              <span>Loading table column rules...</span>
            </div>
          ) : availableConfigs.length === 0 ? (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-1">
              <p className="text-[11px] text-slate-600">
                No column rules configured yet for <code className="text-slate-800 font-mono font-bold">{effectiveTable || 'this table'}</code>.
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
                    className={`p-2.5 rounded-xl border text-xs cursor-pointer transition select-none shadow-2xs ${
                      isAttached
                        ? 'bg-orange-50/40 border-[#F27421] text-slate-900'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <div className="flex items-center space-x-1.5 min-w-0">
                        {isAttached ? (
                          <CheckSquare size={13} className="text-[#F27421] shrink-0" />
                        ) : (
                          <Square size={13} className="text-slate-400 shrink-0" />
                        )}
                        <span className={`font-semibold text-xs truncate ${isAttached ? 'text-slate-900 font-bold' : 'text-slate-700'}`} title={cfg.name}>
                          {cfg.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {cfg.statusBehavior === 'REPORT_ONLY' && (
                          <span className="text-[7px] font-mono uppercase px-1 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-200">
                            REPORT ONLY
                          </span>
                        )}
                        <span className={`text-[9px] font-mono px-1 py-0.2 rounded border shrink-0 ${badge.bg}`}>
                          {badge.label}
                        </span>
                      </div>
                    </div>

                    {colNames.length > 0 && (
                      <div className="mt-1 pl-5 text-[10px] font-mono text-slate-500 truncate" title={colNames.join(', ')}>
                        cols: {colNames.join(', ')}
                      </div>
                    )}

                    <div className="mt-1 pl-5 flex items-center gap-1.5 text-[9px] font-mono">
                      <span className={`px-1 py-0.2 rounded border ${
                        cfg.violationAction === 'STOP' ? 'bg-rose-50 border-rose-200 text-rose-700' :
                        cfg.violationAction === 'FLAG' ? 'bg-amber-50 border-amber-200 text-amber-800' :
                        'bg-emerald-50 border-emerald-200 text-emerald-800'
                      }`}>
                        {cfg.violationAction}
                      </span>
                      <span className="text-slate-400">•</span>
                      <span className="text-slate-500">{cfg.severity}</span>
                      {cfg.filterConditions && cfg.filterConditions.length > 0 && (
                        <>
                          <span className="text-slate-400">•</span>
                          <span className="text-[#F27421]">{cfg.filterConditions.length} filters</span>
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
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-slate-600 shadow-2xs">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-800 font-mono">
            <Info size={12} className="text-[#F27421] shrink-0" />
            <span>Stage Inheritance</span>
          </div>
          <p className="text-[10px] leading-relaxed">
            Flowchart nodes targeting <code className="text-slate-800 font-mono font-bold">{effectiveTable || 'this table'}</code> automatically inherit accepted rules unless individual stages specify custom overrides.
          </p>
        </div>
      </div>
    </aside>
  );
};
