/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  DatabaseValidationWorkflow,
  ProcessingStage,
  QueryExtraction,
  QueryColumn,
  QueryKeyMapping,
  QueryFilter,
  DatabaseConnection
} from '../../types';
import { resolveRequiredColumnsForStage } from '../../services/requiredFieldResolver';
import { api } from '../../api/client';
import {
  Database,
  Layers,
  Search,
  Key,
  Filter,
  Play,
  Save,
  Check,
  AlertTriangle,
  Code,
  Sparkles,
  RefreshCw
} from 'lucide-react';

interface QuerySandboxProps {
  workflow: DatabaseValidationWorkflow;
  stages: ProcessingStage[];
  databaseConnections: DatabaseConnection[];
  initialStageId?: string;
  onSaveExtraction?: (extraction: QueryExtraction) => void;
  onClose?: () => void;
}

export const QuerySandbox: React.FC<QuerySandboxProps> = ({
  workflow,
  stages,
  databaseConnections,
  initialStageId,
  onSaveExtraction,
  onClose
}) => {
  const [selectedStageId, setSelectedStageId] = useState<string>(
    initialStageId || (stages[0]?.id ?? '')
  );

  const activeStage = useMemo(() => {
    return stages.find(s => s.id === selectedStageId) || stages[0];
  }, [stages, selectedStageId]);

  const [targetDbId, setTargetDbId] = useState<string>(activeStage?.targetDbId || databaseConnections[0]?.id || '');
  const [targetDataSource, setTargetDataSource] = useState<string>(activeStage?.targetDataSource || '');
  const [keyField, setKeyField] = useState<string>('transaction_id');
  const [inputKeyField, setInputKeyField] = useState<string>('transaction_id');

  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState<boolean>(false);
  const [loadingColumns, setLoadingColumns] = useState<boolean>(false);

  // Available discovered columns from live database introspection
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);

  const [selectedColMap, setSelectedColMap] = useState<Record<string, boolean>>({});

  const [filterList, setFilterList] = useState<QueryFilter[]>([
    { field: 'status', operator: 'IS_NOT_NULL' }
  ]);

  const [previewSql, setPreviewSql] = useState<string>('');
  const [sampleResult, setSampleResult] = useState<any[] | null>(null);
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [columnSearch, setColumnSearch] = useState<string>('');

  // Auto-detect required fields from stage rules
  const detectedRequirements = useMemo(() => {
    if (!activeStage) return null;
    return resolveRequiredColumnsForStage(activeStage, workflow.steps || []);
  }, [activeStage, workflow]);

  // Synchronize with activeStage change
  useEffect(() => {
    if (activeStage) {
      setTargetDbId(activeStage.targetDbId || databaseConnections[0]?.id || '');
      setTargetDataSource(activeStage.targetDataSource || '');
    }
  }, [activeStage, databaseConnections]);

  // Fetch available tables when targetDbId changes
  useEffect(() => {
    if (!targetDbId) return;
    let isMounted = true;
    setLoadingTables(true);

    api.getDatabaseTables(targetDbId)
      .then(res => {
        if (!isMounted) return;
        const tbls = res.allowedTables && res.allowedTables.length > 0
          ? res.allowedTables
          : (res.availableTables && res.availableTables.length > 0 ? res.availableTables : (res.tables || []));
        setAvailableTables(tbls);
        if (tbls.length > 0 && (!targetDataSource || !tbls.includes(targetDataSource))) {
          setTargetDataSource(tbls[0]);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setAvailableTables([]);
      })
      .finally(() => {
        if (isMounted) setLoadingTables(false);
      });

    return () => { isMounted = false; };
  }, [targetDbId]);

  // Fetch real columns when targetDbId or targetDataSource changes
  useEffect(() => {
    if (!targetDbId || !targetDataSource) return;
    let isMounted = true;
    setLoadingColumns(true);

    api.getTableColumns(targetDbId, targetDataSource)
      .then(res => {
        if (!isMounted) return;
        const colNames = (res.columns || []).map(c => c.name);
        setAvailableColumns(colNames);

        if (colNames.length > 0) {
          // If keyField not in discovered columns, set to first column
          if (!colNames.includes(keyField)) {
            setKeyField(colNames[0]);
            setInputKeyField(colNames[0]);
          }

          // Initial selection of columns (first 8 columns by default)
          const newColMap: Record<string, boolean> = {};
          colNames.slice(0, 8).forEach(c => {
            newColMap[c] = true;
          });
          // Also select any fields required by rules
          if (detectedRequirements) {
            detectedRequirements.requiredColumns.forEach(c => {
              if (colNames.includes(c.sourceColumn)) {
                newColMap[c.sourceColumn] = true;
              }
            });
          }
          setSelectedColMap(newColMap);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setAvailableColumns([]);
      })
      .finally(() => {
        if (isMounted) setLoadingColumns(false);
      });

    return () => { isMounted = false; };
  }, [targetDbId, targetDataSource]);

  // Handle auto-detect apply
  const handleAutoSelectFromRules = () => {
    if (!detectedRequirements) return;
    const nextMap: Record<string, boolean> = { ...selectedColMap };
    nextMap[keyField] = true;

    detectedRequirements.requiredColumns.forEach(c => {
      nextMap[c.sourceColumn] = true;
    });

    setSelectedColMap(nextMap);
  };

  // Generate preview query string
  useEffect(() => {
    const cols = Object.keys(selectedColMap).filter(k => selectedColMap[k]);
    const colStr = cols.length > 0 ? cols.join(', ') : '*';
    let sql = `SELECT ${colStr}\nFROM ${targetDataSource}\nWHERE ${keyField} IN (?, ?, ?);`;
    if (filterList.length > 0) {
      const filterConditions = filterList.map(f => {
        if (f.operator === 'IS_NOT_NULL') return `${f.field} IS NOT NULL`;
        if (f.operator === 'IS_NULL') return `${f.field} IS NULL`;
        if (f.operator === 'EQ') return `${f.field} = '${f.value ?? ''}'`;
        if (f.operator === 'NE') return `${f.field} != '${f.value ?? ''}'`;
        return `${f.field} = ?`;
      }).join(' AND ');
      sql = `SELECT ${colStr}\nFROM ${targetDataSource}\nWHERE ${keyField} IN (?, ?, ?)\n  AND (${filterConditions});`;
    }
    setPreviewSql(sql);
  }, [selectedColMap, targetDataSource, keyField, filterList]);

  // Run Sample Execution
  const handleRunSample = async () => {
    setIsPreviewing(true);
    try {
      const cols: QueryColumn[] = Object.keys(selectedColMap)
        .filter(k => selectedColMap[k])
        .map(c => ({
          sourceColumn: c,
          required: true,
          usedByRuleIds: []
        }));

      const extractionPayload: QueryExtraction = {
        id: `qe-${workflow.id}-${activeStage?.id}`,
        workflowId: workflow.id,
        stageId: activeStage?.id || '',
        targetDbId,
        targetDataSource,
        selectedColumns: cols,
        keyMappings: [{ inputField: inputKeyField, sourceField: keyField, required: true }],
        filters: filterList,
        batchPolicy: { maxRowsPerBatch: 5000, maxQueryKeys: 1000 },
        enabled: true
      };

      // Call API preview
      const previewRes = await api.previewQuerySandbox({
        extraction: extractionPayload,
        sampleKeys: ['TX-1001', 'TX-1002', 'TX-1003']
      });

      if (previewRes?.sql) {
        setPreviewSql(previewRes.sql);
      }

      if (previewRes?.rows && previewRes.rows.length > 0) {
        setSampleResult(previewRes.rows);
      } else {
        // Run live sample query on target database to display real rows
        const currentDb = databaseConnections.find(d => d.id === targetDbId);
        const liveSample = await api.executeQuery({
          userId: 'operator',
          username: 'operator',
          userRole: 'admin',
          dbId: targetDbId,
          dbName: currentDb?.name || targetDbId,
          query: `SELECT ${cols.length > 0 ? cols.map(c => c.sourceColumn).join(', ') : '*'} FROM ${targetDataSource} LIMIT 10;`,
          tableName: targetDataSource
        });
        setSampleResult(liveSample?.rows || []);
      }
    } catch (err) {
      console.error('Preview error:', err);
      setSampleResult([]);
    } finally {
      setIsPreviewing(false);
    }
  };

  // Save QueryExtraction
  const handleSave = async () => {
    setSaveError(null);
    const cols: QueryColumn[] = Object.keys(selectedColMap)
      .filter(k => selectedColMap[k])
      .map(c => ({
        sourceColumn: c,
        required: true,
        usedByRuleIds: detectedRequirements?.requiredColumns.find(rc => rc.sourceColumn === c)?.usedByRuleIds || []
      }));

    const keyMappings: QueryKeyMapping[] = [
      { inputField: inputKeyField, sourceField: keyField, required: true }
    ];

    const extraction: QueryExtraction = {
      id: `qe-${workflow.id}-${activeStage?.id}`,
      workflowId: workflow.id,
      stageId: activeStage?.id || '',
      targetDbId,
      targetDataSource,
      selectedColumns: cols,
      keyMappings,
      filters: filterList,
      batchPolicy: {
        maxRowsPerBatch: 5000,
        maxQueryKeys: 1000
      },
      enabled: true,
      updatedAt: new Date().toISOString()
    };

    try {
      await api.createQueryExtraction(workflow.id, extraction);
      if (onSaveExtraction) {
        onSaveExtraction(extraction);
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Failed to save query extraction:', err);
      setSaveError(`Failed to save extraction: ${err.response?.data?.error || err.message}`);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-300 shadow-sm p-5 space-y-5 font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-600 text-white rounded-lg shadow-xs">
            <Database size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-900 text-sm tracking-tight">
                Design-Time Query Sandbox & Data Extraction
              </h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 font-mono">
                Phase 8
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Configure and validate which external columns are required by each investigation stage. Eliminates wasteful full-table retrieval.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold rounded-lg cursor-pointer"
            >
              Close Sandbox
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            className="px-3.5 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            {saveSuccess ? <Check size={14} className="text-white" /> : <Save size={14} />}
            <span>{saveSuccess ? 'Saved Extraction!' : 'Save QueryExtraction'}</span>
          </button>
        </div>
      </div>

      {saveError && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center justify-between">
          <span>{saveError}</span>
          <button type="button" onClick={() => setSaveError(null)} className="font-bold text-red-500 hover:text-red-700">✕</button>
        </div>
      )}

      {/* Top Config Row: Stage Association & DB Connection */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
        {/* Stage Selector */}
        <div className="space-y-1">
          <label className="font-bold text-slate-700 flex items-center gap-1">
            <Layers size={13} className="text-emerald-700" />
            <span>Investigation Stage:</span>
          </label>
          <select
            value={selectedStageId}
            onChange={(e) => setSelectedStageId(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg p-1.5 font-medium text-slate-900 focus:ring-1 focus:ring-emerald-600"
          >
            {stages.map(st => (
              <option key={st.id} value={st.id}>
                {st.name} ({st.targetDataSource || 'transactions'})
              </option>
            ))}
          </select>
        </div>

        {/* Database Connection */}
        <div className="space-y-1">
          <label className="font-bold text-slate-700 flex items-center gap-1">
            <Database size={13} className="text-blue-600" />
            <span>Target Database:</span>
          </label>
          <select
            value={targetDbId}
            onChange={(e) => setTargetDbId(e.target.value)}
            className="w-full bg-white border border-slate-300 rounded-lg p-1.5 font-medium text-slate-900 focus:ring-1 focus:ring-emerald-600"
          >
            {databaseConnections.length > 0 ? (
              databaseConnections.map(db => (
                <option key={db.id} value={db.id}>
                  {db.name} ({db.type})
                </option>
              ))
            ) : (
              <option value="" disabled>No connections configured</option>
            )}
          </select>
        </div>

        {/* Data Source / Table */}
        <div className="space-y-1">
          <label className="font-bold text-slate-700 flex items-center justify-between">
            <span>Data Source (Table/View):</span>
            {loadingTables && <span className="text-[10px] text-slate-400 font-normal">Loading tables...</span>}
          </label>
          {availableTables.length > 0 ? (
            <select
              value={targetDataSource}
              onChange={(e) => setTargetDataSource(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg p-1.5 font-mono text-xs focus:ring-1 focus:ring-emerald-600 font-bold text-emerald-950"
            >
              {availableTables.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={targetDataSource}
              onChange={(e) => setTargetDataSource(e.target.value)}
              placeholder="e.g. transactions"
              className="w-full bg-white border border-slate-300 rounded-lg p-1.5 font-mono text-xs focus:ring-1 focus:ring-emerald-600"
            />
          )}
        </div>

        {/* Investigation Correlation Key */}
        <div className="space-y-1">
          <label className="font-bold text-slate-700 flex items-center gap-1">
            <Key size={13} className="text-amber-600" />
            <span>Correlation Key (Source Field):</span>
          </label>
          {availableColumns.length > 0 ? (
            <select
              value={keyField}
              onChange={(e) => {
                setKeyField(e.target.value);
                setInputKeyField(e.target.value);
              }}
              className="w-full bg-white border border-slate-300 rounded-lg p-1.5 font-mono text-xs focus:ring-1 focus:ring-emerald-600 font-bold text-slate-800"
            >
              {availableColumns.map(col => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={keyField}
              onChange={(e) => {
                setKeyField(e.target.value);
                setInputKeyField(e.target.value);
              }}
              placeholder="e.g. FE_UTRNNO"
              className="w-full bg-white border border-slate-300 rounded-lg p-1.5 font-mono text-xs focus:ring-1 focus:ring-emerald-600"
            />
          )}
        </div>
      </div>

      {/* Auto-Resolution Banner from Stage Rules */}
      {detectedRequirements && (
        <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-emerald-700 flex-shrink-0" />
            <div>
              <span className="font-bold text-emerald-950">
                Rule Field Inspector:
              </span>{' '}
              <span className="text-emerald-800">
                Stage '{activeStage?.name}' has {detectedRequirements.requiredColumns.length} field(s) required by rules:
              </span>{' '}
              <span className="font-mono font-bold text-emerald-900">
                [{detectedRequirements.requiredColumns.map(c => c.sourceColumn).join(', ')}]
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAutoSelectFromRules}
            className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold flex items-center gap-1 shadow-2xs cursor-pointer flex-shrink-0"
          >
            <Check size={12} />
            <span>Auto-Select Rule Fields</span>
          </button>
        </div>
      )}

      {/* Warnings if any required column is missing */}
      {detectedRequirements?.warnings && detectedRequirements.warnings.length > 0 && (
        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1">
          <div className="font-bold flex items-center gap-1">
            <AlertTriangle size={14} className="text-amber-700" />
            <span>Configuration Warnings:</span>
          </div>
          {detectedRequirements.warnings.map((w, idx) => (
            <p key={idx} className="text-[11px] font-mono text-amber-800">
              • {w}
            </p>
          ))}
        </div>
      )}

      {/* Column Selection Grid & Search */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-800">Required Column Selection:</span>
            <span className="text-[11px] text-slate-500 font-mono">
              ({Object.values(selectedColMap).filter(Boolean).length} of {availableColumns.length} selected)
            </span>
          </div>

          <div className="relative w-52">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={columnSearch}
              onChange={(e) => setColumnSearch(e.target.value)}
              placeholder="Search columns..."
              className="w-full pl-7 pr-2 py-1 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 max-h-48 overflow-y-auto">
          {availableColumns
            .filter(c => c.toLowerCase().includes(columnSearch.toLowerCase()))
            .map(col => {
              const isChecked = Boolean(selectedColMap[col]);
              const isRequiredByRule = detectedRequirements?.requiredColumns.some(rc => rc.sourceColumn === col);

              return (
                <label
                  key={col}
                  className={`flex items-center gap-2 p-1.5 rounded-lg border text-xs cursor-pointer select-none transition ${
                    isChecked
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => setSelectedColMap({ ...selectedColMap, [col]: e.target.checked })}
                    className="rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="truncate font-mono text-[11px]">{col}</span>
                  {isRequiredByRule && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 flex-shrink-0" title="Required by configured rule" />
                  )}
                </label>
              );
            })}
        </div>
      </div>

      {/* Query Preview & Sample Runner */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Query Preview */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
              <Code size={13} className="text-slate-600" />
              <span>Parameterized Query Preview (Design-Time Preview):</span>
            </span>
            <button
              type="button"
              onClick={handleRunSample}
              disabled={isPreviewing}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <Play size={11} className={isPreviewing ? 'animate-spin' : 'fill-white'} />
              <span>{isPreviewing ? 'Executing...' : 'Run Sample (3 Keys)'}</span>
            </button>
          </div>

          <pre className="p-3 bg-slate-900 text-emerald-300 font-mono text-xs rounded-xl overflow-x-auto min-h-[100px] border border-slate-800">
            {previewSql}
          </pre>
        </div>

        {/* Right: Sample Execution Grid */}
        <div className="space-y-1.5">
          <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
            <Filter size={13} className="text-purple-600" />
            <span>Sample Result Preview:</span>
          </span>

          {sampleResult !== null ? (
            sampleResult.length > 0 ? (
              <div className="border border-slate-300 rounded-xl overflow-x-auto max-h-[140px] text-xs">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-mono text-[10px] sticky top-0">
                    <tr>
                      {Object.keys(sampleResult[0] || {}).map(k => (
                        <th key={k} className="p-1.5 border-b border-r border-slate-300">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                    {sampleResult.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-blue-50/30">
                        {Object.values(row).map((val: any, cIdx) => (
                          <td key={cIdx} className="p-1.5 border-r border-slate-200 truncate max-w-[120px]">
                            {String(val ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-[100px] border border-dashed border-slate-300 rounded-xl flex items-center justify-center text-xs text-slate-500 font-mono">
                0 records returned from {targetDataSource} in target database.
              </div>
            )
          ) : (
            <div className="h-[100px] border border-dashed border-slate-300 rounded-xl flex items-center justify-center text-xs text-slate-400 font-mono">
              Click 'Run Sample' to execute a live query preview against {targetDataSource}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
