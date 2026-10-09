/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  HashtagPreset, HashtagType, DataSourceMode, 
  DatabaseConnection, User, DictionaryLookupMapping 
} from '../../types';
import { api } from '../../api/client';
import { ErrorBoundary } from '../ErrorBoundary';
import { 
  Tag, Plus, Terminal, CheckCircle, FileText, X, Sparkles,
  Database, Play, Upload, Check, AlertTriangle, Layers,
  Activity, ArrowRight, ShieldCheck, RefreshCw, Eye
} from 'lucide-react';

interface HashtagManagerProps {
  hashtags: HashtagPreset[];
  currentUser: User;
  onCreatePreset: (preset: HashtagPreset) => void;
  databases?: DatabaseConnection[];
  onClose?: () => void;
  initialCreating?: boolean;
}

export default function HashtagManager({
  hashtags,
  currentUser,
  onCreatePreset,
  databases = [],
  onClose,
  initialCreating
}: HashtagManagerProps) {
  return (
    <ErrorBoundary fallbackTitle="Hashtag Manager Error" fallbackMessage="Could not render Hashtag Solution Preset Library.">
      <HashtagManagerContent
        hashtags={hashtags}
        currentUser={currentUser}
        onCreatePreset={onCreatePreset}
        databases={databases}
        onClose={onClose}
        initialCreating={initialCreating}
      />
    </ErrorBoundary>
  );
}

function HashtagManagerContent({
  hashtags,
  currentUser,
  onCreatePreset,
  databases = [],
  onClose,
  initialCreating
}: HashtagManagerProps) {
  const [selectedTag, setSelectedTag] = useState<HashtagPreset | null>(hashtags[0] || null);
  const [isCreating, setIsCreating] = useState(initialCreating || false);
  const [activeFilterType, setActiveFilterType] = useState<string>('ALL');

  // Pre-Flight & Scan Testing State
  const [preFlightLoading, setPreFlightLoading] = useState(false);
  const [preFlightResult, setPreFlightResult] = useState<any | null>(null);
  const [showPreFlightModal, setShowPreFlightModal] = useState(false);
  const [scanResult, setScanResult] = useState<any | null>(null);
  const [scanLoading, setScanLoading] = useState(false);

  // Form State: 4-Type Universal Taxonomy
  const [newTagName, setNewTagName] = useState('#');
  const [newType, setNewType] = useState<HashtagType>('FILE_INGESTION');
  const [newDataSourceMode, setNewDataSourceMode] = useState<DataSourceMode>('FILE_UPLOAD');
  const [newDesc, setNewDesc] = useState('');
  const [newCriteria, setNewCriteria] = useState('');
  const [newHeaders, setNewHeaders] = useState('Transaction_ID, Card_Number, Amount_USD');
  const [newSql, setNewSql] = useState("UPDATE transactions SET status = 'REVERSED' WHERE transaction_id = '{{Transaction_ID}}';");
  const [newTargetDbId, setNewTargetDbId] = useState('');
  const [newTargetTableName, setNewTargetTableName] = useState('');
  const [newDedicatedAppTable, setNewDedicatedAppTable] = useState('');
  const [minRequiredCols, setMinRequiredCols] = useState<string[]>(['Transaction_ID', 'Amount_USD']);
  const [lookupSourceCol, setLookupSourceCol] = useState('bank_code');
  const [lookupTargetCol, setLookupTargetCol] = useState('bank_name');
  const [lookupTable, setLookupTable] = useState('bank_directory');
  const [enableLookup, setEnableLookup] = useState(false);

  // Sample file upload parsing for Type A
  const handleSampleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length > 0) {
          const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
          setNewHeaders(headers.join(', '));
          setMinRequiredCols(headers.slice(0, 3));
        }
      } catch (err) {
        console.warn('Could not parse sample CSV header', err);
      }
    };
    reader.readAsText(file);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const formattedTag = newTagName.startsWith('#') ? newTagName.toUpperCase() : `#${newTagName.toUpperCase()}`;
    const headersList = newHeaders.split(',').map(h => h.trim()).filter(Boolean);

    const dictionaryMappings: Record<string, DictionaryLookupMapping> = {};
    if (enableLookup && lookupSourceCol && lookupTargetCol) {
      dictionaryMappings[lookupSourceCol] = {
        sourceCol: lookupSourceCol,
        targetCol: lookupTargetCol,
        lookupTable: lookupTable || 'bank_directory',
        fallbackValue: 'UNKNOWN'
      };
    }

    const preset: HashtagPreset = {
      tag: formattedTag,
      description: newDesc,
      criteria: newCriteria,
      expectedFileStructure: headersList,
      solutionTemplate: newSql,
      author: currentUser.username,
      createdAt: new Date().toISOString(),
      // Universal engine fields
      hashtagType: newType,
      dataSourceMode: newType === 'DATABASE_DIRECT_SCANNER' ? 'DATABASE_DIRECT' : (newType === 'FILE_INGESTION' ? 'FILE_UPLOAD' : newDataSourceMode),
      targetDbId: newTargetDbId || null,
      targetTableName: newTargetTableName || null,
      dedicatedAppTable: newDedicatedAppTable || (newType === 'EXTRACTION_STAGING' ? `hashtag_stage_${formattedTag.replace(/^#+/, '').toLowerCase()}` : null),
      minimumRequiredColumns: minRequiredCols,
      dictionaryLookupMappings: dictionaryMappings,
      executionTrigger: 'MANUAL',
      conditionalAction: { onPass: 'EXECUTE_SQL', onFail: 'FLAG_INVESTIGATION' }
    };

    onCreatePreset(preset);
    setSelectedTag(preset);
    setIsCreating(false);
    setNewTagName('#');
    setNewDesc('');
    setNewCriteria('');
  };

  const runPreFlightTest = async (tag: HashtagPreset) => {
    setPreFlightLoading(true);
    setPreFlightResult(null);
    setShowPreFlightModal(true);

    try {
      // Mock 3 sample rows if Type A has headers
      const sampleRows = (tag.expectedFileStructure || []).length > 0 ? [
        {
          ...(tag.expectedFileStructure || []).reduce((acc: any, col: string) => {
            acc[col] = col.toLowerCase().includes('id') ? 'TX-9001' : (col.toLowerCase().includes('code') ? '001' : '100.00');
            return acc;
          }, {})
        }
      ] : [];

      const res = await api.testHashtagPreflight(tag.tag, sampleRows);
      setPreFlightResult(res);
    } catch (err: any) {
      setPreFlightResult({
        success: false,
        errors: [err.message || 'Pre-flight check failed'],
        columnValidation: [],
        lookupResolution: []
      });
    } finally {
      setPreFlightLoading(false);
    }
  };

  const runDatabaseScan = async (tag: HashtagPreset, isDryRun: boolean = true) => {
    setScanLoading(true);
    setScanResult(null);

    try {
      const res = await api.executeHashtagScan(tag.tag, {
        executedBy: currentUser.username,
        isDryRun
      });
      setScanResult(res);
    } catch (err: any) {
      setScanResult({
        verdict: 'ERROR',
        errors: [err.message || 'Database scan failed'],
        rowsScanned: 0,
        anomaliesDetected: 0,
        anomalyRows: []
      });
    } finally {
      setScanLoading(false);
    }
  };

  const filteredHashtags = hashtags.filter(h => {
    if (activeFilterType === 'ALL') return true;
    return (h.hashtagType || 'FILE_INGESTION') === activeFilterType;
  });

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 lg:p-6 mb-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 mb-6 gap-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-indigo-700 text-white rounded-xl shadow-xs">
            <Tag className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900">Universal Hashtag Automation Library</h2>
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-mono font-bold">
                Directives & Scanners
              </span>
            </div>
            <p className="text-xs text-slate-500">Autonomous operational directives, zero-file DB anomaly scanners, dictionary mappers, and SQL remediation</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition"
            >
              Close
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Hashtag Preset</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs by Hashtag Type */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4 border-b border-slate-100 no-scrollbar">
        {[
          { id: 'ALL', label: 'All Directives' },
          { id: 'FILE_INGESTION', label: 'Type A: File Ingestion' },
          { id: 'DATABASE_DIRECT_SCANNER', label: 'Type B: Zero-File DB Scanner' },
          { id: 'EXTRACTION_STAGING', label: 'Type C: ETL Staging' },
          { id: 'AUDITING_GOVERNANCE', label: 'Type D: Audit & Compliance' }
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveFilterType(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              activeFilterType === tab.id
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Preset Cards */}
        <div className="space-y-2.5 max-h-[560px] overflow-y-auto pr-1">
          {filteredHashtags.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
              No hashtags found matching filter.
            </div>
          ) : (
            filteredHashtags.map((h) => {
              const isSelected = selectedTag?.tag === h.tag;
              const type = h.hashtagType || 'FILE_INGESTION';
              return (
                <div
                  key={h.tag}
                  onClick={() => setSelectedTag(h)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition ${
                    isSelected
                      ? 'bg-indigo-50/90 border-indigo-300 shadow-xs'
                      : 'bg-slate-50 hover:bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm text-indigo-900 font-mono">{h.tag}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                      type === 'DATABASE_DIRECT_SCANNER' ? 'bg-amber-100 text-amber-800' :
                      type === 'EXTRACTION_STAGING' ? 'bg-emerald-100 text-emerald-800' :
                      type === 'AUDITING_GOVERNANCE' ? 'bg-purple-100 text-purple-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {type === 'DATABASE_DIRECT_SCANNER' ? 'DB Scanner' :
                       type === 'EXTRACTION_STAGING' ? 'ETL Staging' :
                       type === 'AUDITING_GOVERNANCE' ? 'Audit' : 'File Ingest'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mb-2">{h.description}</p>
                  
                  <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-400 font-mono">
                    <span>@{h.author}</span>
                    {h.targetTableName && (
                      <span className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-600 flex items-center gap-1">
                        <Database size={10} /> {h.targetTableName}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Detailed Inspector */}
        <div className="lg:col-span-2 bg-slate-50 rounded-2xl p-5 border border-slate-200 flex flex-col justify-between">
          {selectedTag ? (
            <div className="space-y-4">
              {/* Header Info */}
              <div className="flex items-start justify-between pb-3 border-b border-slate-200 gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-indigo-900 font-mono">{selectedTag.tag}</span>
                    <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-mono text-xs font-bold">
                      {selectedTag.hashtagType || 'FILE_INGESTION'}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-xs">
                      {selectedTag.dataSourceMode || 'FILE_UPLOAD'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1">{selectedTag.description}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => runPreFlightTest(selectedTag)}
                    disabled={preFlightLoading}
                    className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${preFlightLoading ? 'animate-spin' : ''}`} />
                    <span>Pre-Flight Test</span>
                  </button>

                  {selectedTag.hashtagType === 'DATABASE_DIRECT_SCANNER' && (
                    <>
                      <button
                        type="button"
                        onClick={() => runDatabaseScan(selectedTag, true)}
                        disabled={scanLoading}
                        className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                        title="Run dry-run observational scan without triggering remediations"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>{scanLoading ? 'Scanning...' : 'Dry-Run Scan'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => runDatabaseScan(selectedTag, false)}
                        disabled={scanLoading}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                        title="Run live scan and stage Maker-Checker proposal if clean/fixable"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>{scanLoading ? 'Running...' : 'Run & Remediate (Live)'}</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Target DB & Table (if configured) */}
              {(selectedTag.targetTableName || selectedTag.targetDbId) && (
                <div className="p-3 bg-white rounded-xl border border-slate-200 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block font-mono">Target Database</span>
                    <span className="font-semibold text-slate-800">{selectedTag.targetDbId || 'Internal PostgreSQL App DB'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block font-mono">Target / Mirror Table</span>
                    <span className="font-mono font-bold text-indigo-600">{selectedTag.targetTableName}</span>
                  </div>
                </div>
              )}

              {/* Criteria / Detection Logic */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Validation / Anomaly Detection Criteria
                </label>
                <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs text-slate-700 font-mono leading-relaxed">
                  {selectedTag.criteria || 'Standard header and schema validation'}
                </div>
              </div>

              {/* Required Columns & Dictionary Lookups */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Minimum Required Columns
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {(selectedTag.minimumRequiredColumns && selectedTag.minimumRequiredColumns.length > 0
                      ? selectedTag.minimumRequiredColumns
                      : selectedTag.expectedFileStructure || []
                    ).map(col => (
                      <span key={col} className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 text-[11px] font-mono border border-indigo-200">
                        {col}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Dictionary Lookups ({Object.keys(selectedTag.dictionaryLookupMappings || {}).length})
                  </label>
                  <div className="space-y-1">
                    {Object.entries(selectedTag.dictionaryLookupMappings || {}).length === 0 ? (
                      <span className="text-xs text-slate-400 italic">None configured</span>
                    ) : (
                      Object.entries(selectedTag.dictionaryLookupMappings || {}).map(([key, map]: [string, any]) => (
                        <div key={key} className="text-[11px] font-mono bg-white p-1.5 rounded border border-slate-200 flex items-center gap-1 text-slate-700">
                          <span className="text-indigo-600 font-bold">{map.sourceCol}</span>
                          <ArrowRight size={10} className="text-slate-400" />
                          <span className="text-emerald-600 font-bold">{map.targetCol}</span>
                          <span className="text-slate-400 text-[10px]">({map.lookupTable})</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Solution SQL Template */}
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Automated SQL Remediation Template
                </label>
                <div className="p-3 bg-slate-900 rounded-xl text-emerald-400 font-mono text-xs overflow-x-auto shadow-inner">
                  <pre>{selectedTag.solutionTemplate || '-- No solution template defined'}</pre>
                </div>
              </div>

              {/* Live Scan Results (if executed) */}
              {scanResult && (
                <div className={`p-4 rounded-xl border ${
                  scanResult.verdict === 'PASS' ? 'bg-emerald-50 border-emerald-200' :
                  scanResult.verdict === 'DISCREPANCY' ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-xs">
                      Scan Verdict: <span className="font-mono">{scanResult.verdict}</span>
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      Scanned: {scanResult.rowsScanned} | Anomalies: {scanResult.anomaliesDetected}
                    </span>
                  </div>
                  {scanResult.stagedProposalId && (
                    <div className="mb-2 p-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-mono text-indigo-800 flex items-center justify-between">
                      <span>Maker Proposal Staged: <strong>{scanResult.stagedProposalId}</strong></span>
                      <span className="px-2 py-0.5 rounded bg-indigo-200 text-indigo-900 font-bold text-[10px]">PENDING_CHECKER</span>
                    </div>
                  )}
                  {scanResult.anomalyRows?.length > 0 && (
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs font-mono max-h-32 overflow-y-auto">
                      <pre>{JSON.stringify(scanResult.anomalyRows.slice(0, 3), null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
              Select a hashtag preset from the library on the left
            </div>
          )}
        </div>
      </div>

      {/* Modal: Pre-Flight Test Drawer */}
      {showPreFlightModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 shrink-0">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <span>Pre-Flight Inspection: {selectedTag?.tag}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowPreFlightModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto py-4 space-y-4">
              {preFlightLoading ? (
                <div className="p-8 text-center text-slate-500 text-sm flex flex-col items-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                  <span>Validating schema, column integrity, and dictionary lookup resolution...</span>
                </div>
              ) : preFlightResult ? (
                <>
                  <div className={`p-4 rounded-xl border flex items-center justify-between ${
                    preFlightResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}>
                    <div className="flex items-center gap-2 font-bold text-sm">
                      {preFlightResult.success ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                      <span>{preFlightResult.success ? 'Pre-Flight Passed: Ready for Ingestion' : 'Pre-Flight Verification Failed'}</span>
                    </div>
                    <span className="font-mono text-xs">
                      Rows Matched: {preFlightResult.matchedRows} / {preFlightResult.totalScanned}
                    </span>
                  </div>

                  {preFlightResult.columnValidation?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 font-mono">Column Validation Matrix</h4>
                      <div className="space-y-1.5">
                        {preFlightResult.columnValidation.map((c: any) => (
                          <div key={c.column} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                            <span className="font-mono font-bold text-slate-800">{c.column}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-slate-500 font-mono">Nulls: {c.nullCount}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                c.valid ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                              }`}>
                                {c.valid ? 'VALID' : 'MISSING'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {preFlightResult.lookupResolution?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 font-mono">Dictionary Lookup Verification</h4>
                      <div className="space-y-1.5">
                        {preFlightResult.lookupResolution.map((lk: any) => (
                          <div key={lk.mapping} className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs space-y-1">
                            <div className="flex items-center justify-between font-mono font-bold">
                              <span className="text-indigo-600">{lk.mapping}</span>
                              <span className="text-slate-500">Resolved: {lk.resolved} | Failed: {lk.failed}</span>
                            </div>
                            {lk.samples?.length > 0 && (
                              <div className="bg-white p-2 rounded border border-slate-100 text-[11px] font-mono text-slate-600">
                                Sample Translation: {JSON.stringify(lk.samples[0])}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {preFlightResult.errors?.length > 0 && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 space-y-1">
                      {preFlightResult.errors.map((e: string, idx: number) => (
                        <div key={idx} className="flex items-center gap-1.5 font-mono">
                          <AlertTriangle size={12} /> {e}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}
            </div>

            <div className="pt-3 border-t border-slate-200 shrink-0 flex justify-end">
              <button
                type="button"
                onClick={() => setShowPreFlightModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Create Hashtag Preset (Universal 4-Type Creator) */}
      {isCreating && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                <Tag className="w-5 h-5 text-indigo-600" />
                <span>Create Universal Hashtag Directive</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="flex-1 min-h-0 overflow-y-auto py-4 space-y-4 pr-1">
              {/* Type Selector Segmented Control */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase font-mono">
                  Directive Type & Taxonomy
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'FILE_INGESTION', label: 'Type A: File Ingestion' },
                    { id: 'DATABASE_DIRECT_SCANNER', label: 'Type B: DB Scanner' },
                    { id: 'EXTRACTION_STAGING', label: 'Type C: ETL Staging' },
                    { id: 'AUDITING_GOVERNANCE', label: 'Type D: Audit' }
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setNewType(t.id as HashtagType);
                        if (t.id === 'DATABASE_DIRECT_SCANNER') setNewDataSourceMode('DATABASE_DIRECT');
                        else if (t.id === 'FILE_INGESTION') setNewDataSourceMode('FILE_UPLOAD');
                      }}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-center transition cursor-pointer ${
                        newType === t.id
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tag Name & Description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tag Identifier (e.g. #DUPLICATE_AUTH)
                  </label>
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    required
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-indigo-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Condition or anomaly addressed"
                    required
                    className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Dynamic Panel: Type A File-Ingestion */}
              {newType === 'FILE_INGESTION' && (
                <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5 font-mono">
                      <Upload size={14} /> Sample File Upload & Column Integrity
                    </span>
                    <label className="px-2.5 py-1 bg-white border border-indigo-200 text-indigo-700 rounded-lg text-xs font-semibold cursor-pointer hover:bg-indigo-50 transition shadow-2xs">
                      <span>Upload Sample CSV</span>
                      <input type="file" accept=".csv" onChange={handleSampleFileUpload} className="hidden" />
                    </label>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Expected Column Headers (Comma separated)
                    </label>
                    <input
                      type="text"
                      value={newHeaders}
                      onChange={(e) => setNewHeaders(e.target.value)}
                      className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  {/* Dictionary Lookup Toggle */}
                  <div className="pt-2 border-t border-indigo-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-700">Dictionary Lookup Mapping</span>
                      <label className="flex items-center gap-1.5 text-xs text-indigo-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={enableLookup}
                          onChange={(e) => setEnableLookup(e.target.checked)}
                          className="rounded text-indigo-600"
                        />
                        <span>Enable Code Translation</span>
                      </label>
                    </div>

                    {enableLookup && (
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-500 font-mono">Source Column</label>
                          <input
                            type="text"
                            value={lookupSourceCol}
                            onChange={(e) => setLookupSourceCol(e.target.value)}
                            placeholder="e.g. bank_code"
                            className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 font-mono">Target Column</label>
                          <input
                            type="text"
                            value={lookupTargetCol}
                            onChange={(e) => setLookupTargetCol(e.target.value)}
                            placeholder="e.g. bank_name"
                            className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 font-mono">Lookup Directory</label>
                          <select
                            value={lookupTable}
                            onChange={(e) => setLookupTable(e.target.value)}
                            className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg font-mono"
                          >
                            <option value="bank_directory">bank_directory</option>
                            <option value="iso_response_codes">iso_response_codes</option>
                            <option value="terminal_master">terminal_master</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Dynamic Panel: Type B & C Database Connection Target */}
              {(newType === 'DATABASE_DIRECT_SCANNER' || newType === 'EXTRACTION_STAGING') && (
                <div className="p-4 bg-amber-50/50 rounded-xl border border-amber-200 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 font-mono">
                    <Database size={14} /> Target Database Connection & Table Configuration
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Target DB Connection</label>
                      <select
                        value={newTargetDbId}
                        onChange={(e) => setNewTargetDbId(e.target.value)}
                        className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-xl"
                      >
                        <option value="">Internal PostgreSQL (Mirror Tables)</option>
                        {databases.map(db => (
                          <option key={db.id} value={db.id}>
                            {db.name} ({db.type})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Target / Mirror Table Name</label>
                      <input
                        type="text"
                        value={newTargetTableName}
                        onChange={(e) => setNewTargetTableName(e.target.value)}
                        placeholder="e.g. mirror_ftp_settlement_feed"
                        required
                        className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-xl font-mono"
                      />
                    </div>
                  </div>

                  {newType === 'EXTRACTION_STAGING' && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Dedicated App Staging Table</label>
                      <input
                        type="text"
                        value={newDedicatedAppTable}
                        onChange={(e) => setNewDedicatedAppTable(e.target.value)}
                        placeholder="e.g. hashtag_stage_aib_settlement"
                        className="w-full text-xs p-2.5 bg-white border border-slate-200 rounded-xl font-mono"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Criteria */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Discrepancy / Anomaly Detection Criteria
                </label>
                <input
                  type="text"
                  value={newCriteria}
                  onChange={(e) => setNewCriteria(e.target.value)}
                  placeholder="e.g. ref_num, card_num (for duplicates) or status = 'PENDING'"
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* SQL Solution Template */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Remediation SQL Template
                </label>
                <textarea
                  rows={3}
                  value={newSql}
                  onChange={(e) => setNewSql(e.target.value)}
                  className="w-full text-xs p-2.5 bg-slate-900 text-emerald-400 rounded-xl font-mono focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  Save Universal Preset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
