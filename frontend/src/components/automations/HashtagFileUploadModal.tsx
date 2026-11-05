/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { 
  Upload, X, CheckCircle2, AlertTriangle, FileSpreadsheet, 
  Play, RefreshCw, Layers, ArrowRight, ShieldCheck, Check,
  Info, Database, AlertCircle, FileText
} from 'lucide-react';
import { api } from '../../api/client';
import { HashtagPreset } from '../../types';

interface HashtagFileUploadModalProps {
  hashtagTag: string;
  preset?: HashtagPreset | null;
  onClose: () => void;
  onSuccess?: (runData: { runId: string; stats?: any; newlyCollectedCount?: number }) => void;
  currentUser?: { id?: string; name?: string; role?: string };
}

export function HashtagFileUploadModal({
  hashtagTag,
  preset,
  onClose,
  onSuccess,
  currentUser
}: HashtagFileUploadModalProps) {
  const cleanTag = hashtagTag?.trim().startsWith('#') 
    ? hashtagTag.trim() 
    : (hashtagTag ? `#${hashtagTag.trim()}` : '#SETTLEMENT_AMOUNT_ROUNDING');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<string>('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, any>[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  // Execution state
  const [executionMode, setExecutionMode] = useState<'DRY_RUN' | 'LIVE_FULL'>('LIVE_FULL');
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionStep, setExecutionStep] = useState<number>(0);
  const [executionResult, setExecutionResult] = useState<{
    runId: string;
    valid: boolean;
    missingColumns: string[];
    errors: string[];
    newlyCollectedCount?: number;
    fixedCount?: number;
    waitingCount?: number;
    failedCount?: number;
    stats?: any;
    isDryRun?: boolean;
  } | null>(null);

  // Expected columns derived from preset or standard fallback
  const requiredColumns = preset?.minimumRequiredColumns && preset.minimumRequiredColumns.length > 0
    ? preset.minimumRequiredColumns
    : (preset?.expectedFileStructure && preset.expectedFileStructure.length > 0
      ? preset.expectedFileStructure
      : ['Transaction_ID', 'Card_Number', 'Amount_USD', 'Auth_Time']);

  // Check column matching
  const matchedColumns = requiredColumns.filter(col => 
    parsedHeaders.some(h => h.toLowerCase() === col.toLowerCase())
  );
  const missingColumns = requiredColumns.filter(col => 
    !parsedHeaders.some(h => h.toLowerCase() === col.toLowerCase())
  );

  const processWorkbook = (workbook: XLSX.WorkBook, name: string, sizeBytes: number) => {
    const sheets = workbook.SheetNames;
    if (!sheets || sheets.length === 0) {
      setParseError('The uploaded workbook contains no readable sheets.');
      return;
    }
    setSheetNames(sheets);
    const activeSheetName = sheets[0];
    setSelectedSheet(activeSheetName);

    const worksheet = workbook.Sheets[activeSheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
    if (rawRows.length === 0) {
      setParseError('The selected worksheet is empty.');
      return;
    }

    const headers = (rawRows[0] || []).map((h: any) => String(h || '').trim()).filter(Boolean);
    const rows = XLSX.utils.sheet_to_json(worksheet) as Record<string, any>[];

    setFileName(name);
    setFileSize(`${(sizeBytes / 1024).toFixed(1)} KB`);
    setParsedHeaders(headers);
    setParsedRows(rows);
    setParseError(null);
    setExecutionResult(null);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await parseFile(file);
  };

  const parseFile = async (file: File) => {
    setParseError(null);
    try {
      const lower = file.name.toLowerCase();
      if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        processWorkbook(workbook, file.name, file.size);
      } else if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
        const text = await file.text();
        const workbook = XLSX.read(text, { type: 'string' });
        processWorkbook(workbook, file.name, file.size);
      } else if (lower.endsWith('.json')) {
        const text = await file.text();
        const json = JSON.parse(text);
        const rows = Array.isArray(json) ? json : [json];
        if (rows.length === 0) throw new Error('JSON file contains an empty array');
        const headers = Object.keys(rows[0]);
        setFileName(file.name);
        setFileSize(`${(file.size / 1024).toFixed(1)} KB`);
        setSheetNames(['JSON_Payload']);
        setSelectedSheet('JSON_Payload');
        setParsedHeaders(headers);
        setParsedRows(rows);
        setParseError(null);
      } else {
        // Fallback XLSX text parsing
        const text = await file.text();
        const workbook = XLSX.read(text, { type: 'string' });
        processWorkbook(workbook, file.name, file.size);
      }
    } catch (err: any) {
      setParseError(err.message || 'Failed to parse file structure');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await parseFile(file);
    }
  };

  // Sample batch generator for 1-click test
  const handleLoadSampleBatch = () => {
    const sampleRows: Record<string, any>[] = [
      { Transaction_ID: 'TXN-11001', Card_Number: '4111********1024', Amount_USD: 24.50, Auth_Time: '2026-10-25 09:14:02', Terminal_ID: 'TERM-01', Status: 'PENDING' },
      { Transaction_ID: 'TXN-11002', Card_Number: '4111********3819', Amount_USD: 18.25, Auth_Time: '2026-10-25 09:15:30', Terminal_ID: 'TERM-01', Status: 'PENDING' },
      { Transaction_ID: 'TXN-11003', Card_Number: '4222********9901', Amount_USD: 49.00, Auth_Time: '2026-10-25 09:17:11', Terminal_ID: 'TERM-02', Status: 'PENDING' },
      { Transaction_ID: 'TXN-11004', Card_Number: '4333********5541', Amount_USD: 12.80, Auth_Time: '2026-10-25 09:20:45', Terminal_ID: 'TERM-03', Status: 'PENDING' },
      { Transaction_ID: 'TXN-11005', Card_Number: '4444********7722', Amount_USD: 65.50, Auth_Time: '2026-10-25 09:22:18', Terminal_ID: 'TERM-01', Status: 'PENDING', is_discrepant: true },
      { Transaction_ID: 'TXN-11006', Card_Number: '4555********8813', Amount_USD: 33.10, Auth_Time: '2026-10-25 09:25:00', Terminal_ID: 'TERM-02', Status: 'PENDING' },
      { Transaction_ID: 'TXN-11007', Card_Number: '4666********1290', Amount_USD: 15.00, Auth_Time: '2026-10-25 09:28:14', Terminal_ID: 'TERM-02', Status: 'PENDING' },
      { Transaction_ID: 'TXN-11008', Card_Number: '4777********3456', Amount_USD: 22.40, Auth_Time: '2026-10-25 09:30:22', Terminal_ID: 'TERM-04', Status: 'PENDING' },
      { Transaction_ID: 'TXN-11009', Card_Number: '4888********7890', Amount_USD: 19.99, Auth_Time: '2026-10-25 09:33:05', Terminal_ID: 'TERM-03', Status: 'PENDING' },
      { Transaction_ID: 'TXN-11010', Card_Number: '4999********2341', Amount_USD: 85.00, Auth_Time: '2026-10-25 09:35:50', Terminal_ID: 'TERM-01', Status: 'PENDING' }
    ];

    setFileName('AIB_Daily_Settlement_Sample_Batch.xlsx');
    setFileSize('14.2 KB');
    setSheetNames(['Settlement_Batch']);
    setSelectedSheet('Settlement_Batch');
    setParsedHeaders(Object.keys(sampleRows[0]));
    setParsedRows(sampleRows);
    setParseError(null);
    setExecutionResult(null);
  };

  const handleExecute = async () => {
    if (parsedRows.length === 0) return;
    setIsExecuting(true);
    setExecutionStep(1);

    try {
      // Step 1: Validate headers
      await new Promise(r => setTimeout(r, 400));
      setExecutionStep(2);

      // Step 2: Apply dictionaries
      await new Promise(r => setTimeout(r, 400));
      setExecutionStep(3);

      // Step 3: Call API to execute file ingestion
      const res = await api.executeHashtagFile(cleanTag, {
        executedBy: currentUser?.name || currentUser?.id || 'samuel_tech',
        fileRows: parsedRows,
        executionMode
      });

      setExecutionStep(4);
      await new Promise(r => setTimeout(r, 300));

      setExecutionResult({
        runId: res.runId,
        valid: res.valid,
        missingColumns: res.missingColumns || [],
        errors: res.errors || [],
        newlyCollectedCount: res.newlyCollectedCount,
        fixedCount: res.fixedCount,
        waitingCount: res.waitingCount,
        failedCount: res.failedCount,
        stats: res.stats,
        isDryRun: executionMode === 'DRY_RUN'
      });

      if (onSuccess && executionMode === 'LIVE_FULL') {
        onSuccess({
          runId: res.runId,
          stats: res.stats,
          newlyCollectedCount: res.newlyCollectedCount
        });
      }
    } catch (err: any) {
      setParseError(err.message || 'Execution failed');
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100 text-[#F27421] flex items-center justify-center shrink-0">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-slate-900 text-base font-heading">
                  Upload & Run Settlement File
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-orange-50 text-orange-700 border border-orange-200/80">
                  {cleanTag}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Drop settlement records to validate schema, resolve mappings, and run approved SQL remediation.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs flex-1 min-h-0">
          
          {/* 1. Dropzone */}
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.xls,.csv,.txt,.json,.xml"
              className="hidden"
            />

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center transition cursor-pointer ${
                isDragging
                  ? 'border-[#F27421] bg-orange-50/50'
                  : fileName
                  ? 'border-emerald-300 bg-emerald-50/20'
                  : 'border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50'
              }`}
            >
              {fileName ? (
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 text-left">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <FileSpreadsheet className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-xs flex items-center space-x-1.5">
                        <span>{fileName}</span>
                        <span className="text-slate-400 font-normal">({fileSize})</span>
                      </div>
                      <div className="text-[11px] text-emerald-700 font-medium mt-0.5 flex items-center space-x-1">
                        <CheckCircle2 size={12} />
                        <span>Parsed {parsedRows.length} transaction rows</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFileName('');
                      setParsedHeaders([]);
                      setParsedRows([]);
                      setExecutionResult(null);
                    }}
                    className="px-2.5 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg text-xs transition cursor-pointer"
                  >
                    Change file
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 mx-auto flex items-center justify-center">
                    <Upload className="w-5 h-5 text-slate-400" />
                  </div>
                  <div>
                    <span className="font-semibold text-slate-800">Click to upload</span>
                    <span className="text-slate-500"> or drag and drop settlement file</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Supports Microsoft Excel (.xlsx, .xls), CSV, or raw JSON transaction batches
                  </p>
                </div>
              )}
            </div>

            {/* Quick Sample Button */}
            {!fileName && (
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 px-1">
                <span>Need sample test data?</span>
                <button
                  type="button"
                  onClick={handleLoadSampleBatch}
                  className="font-semibold text-[#F27421] hover:underline cursor-pointer flex items-center space-x-1"
                >
                  <FileText size={12} />
                  <span>Load Sample Settlement Batch (10 rows)</span>
                </button>
              </div>
            )}
          </div>

          {/* Parse error alert */}
          {parseError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start space-x-2">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}

          {/* 2. Column Verification Checklist */}
          {parsedHeaders.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  Required Schema Verification
                </h4>
                <span className={`text-[11px] font-semibold flex items-center space-x-1 ${
                  missingColumns.length === 0 ? 'text-emerald-600' : 'text-amber-600'
                }`}>
                  {missingColumns.length === 0 ? (
                    <>
                      <CheckCircle2 size={12} />
                      <span>All required columns detected ({matchedColumns.length}/{requiredColumns.length})</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={12} />
                      <span>Missing {missingColumns.length} required columns</span>
                    </>
                  )}
                </span>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {requiredColumns.map(col => {
                    const isPresent = parsedHeaders.some(h => h.toLowerCase() === col.toLowerCase());
                    return (
                      <span
                        key={col}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-medium flex items-center space-x-1 border ${
                          isPresent
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border-rose-200'
                        }`}
                      >
                        {isPresent ? <Check size={11} className="text-emerald-600" /> : <X size={11} className="text-rose-600" />}
                        <span>{col}</span>
                      </span>
                    );
                  })}
                </div>

                {missingColumns.length > 0 && (
                  <p className="text-[11px] text-rose-600 pt-1 font-medium">
                    Warning: Records missing required columns cannot be remediated automatically.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* 3. Execution Mode Selector */}
          {parsedRows.length > 0 && !executionResult && (
            <div className="space-y-2">
              <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                Execution Directive
              </h4>

              <div className="grid grid-cols-2 gap-3">
                <div
                  onClick={() => setExecutionMode('LIVE_FULL')}
                  className={`p-3.5 rounded-xl border-2 transition cursor-pointer space-y-1 ${
                    executionMode === 'LIVE_FULL'
                      ? 'border-[#F27421] bg-orange-50/30 shadow-2xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs">Execute & Remediate</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800">
                      Live
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Validates schema, runs approved SQL patch, and records all transactions into the hashtag ledger.
                  </p>
                </div>

                <div
                  onClick={() => setExecutionMode('DRY_RUN')}
                  className={`p-3.5 rounded-xl border-2 transition cursor-pointer space-y-1 ${
                    executionMode === 'DRY_RUN'
                      ? 'border-blue-600 bg-blue-50/30 shadow-2xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-xs">Pre-flight Dry Run</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">
                      Zero Risk
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Previews schema validity, row count, and remediation matches without writing to persistent tables.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 4. Preview Table */}
          {parsedRows.length > 0 && !executionResult && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                  Data Preview (First 5 Rows)
                </h4>
                <span className="text-[11px] text-slate-400 font-mono">
                  {parsedRows.length} total rows
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-36 bg-white shadow-2xs">
                <table className="w-full text-left text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-mono">
                      {parsedHeaders.slice(0, 6).map(h => (
                        <th key={h} className="py-2 px-3 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {parsedRows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        {parsedHeaders.slice(0, 6).map(h => (
                          <td key={h} className="py-1.5 px-3 whitespace-nowrap text-slate-700">
                            {String(row[h] ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 5. In-Progress Stepper */}
          {isExecuting && (
            <div className="p-4 bg-orange-50/60 border border-orange-200 rounded-xl space-y-3">
              <div className="flex items-center space-x-2 text-xs font-bold text-orange-900">
                <RefreshCw size={14} className="animate-spin text-[#F27421]" />
                <span>Processing settlement transactions under {cleanTag}...</span>
              </div>

              <div className="grid grid-cols-4 gap-2 text-[11px]">
                <div className={`p-2 rounded-lg border text-center ${executionStep >= 1 ? 'bg-white border-orange-300 font-semibold text-orange-900' : 'bg-slate-100 text-slate-400'}`}>
                  1. Parse File
                </div>
                <div className={`p-2 rounded-lg border text-center ${executionStep >= 2 ? 'bg-white border-orange-300 font-semibold text-orange-900' : 'bg-slate-100 text-slate-400'}`}>
                  2. Check Schema
                </div>
                <div className={`p-2 rounded-lg border text-center ${executionStep >= 3 ? 'bg-white border-orange-300 font-semibold text-orange-900' : 'bg-slate-100 text-slate-400'}`}>
                  3. Dictionaries
                </div>
                <div className={`p-2 rounded-lg border text-center ${executionStep >= 4 ? 'bg-white border-orange-300 font-semibold text-orange-900' : 'bg-slate-100 text-slate-400'}`}>
                  4. Remediate
                </div>
              </div>
            </div>
          )}

          {/* 6. Execution Results Summary */}
          {executionResult && (
            <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    executionResult.valid ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {executionResult.valid ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs">
                      {executionResult.isDryRun ? 'Pre-flight Test Completed' : 'Batch Ingestion & Remediation Finished'}
                    </h4>
                    <span className="text-[11px] text-slate-500 font-mono">
                      Run ID: {executionResult.runId}
                    </span>
                  </div>
                </div>

                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  executionResult.valid ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                }`}>
                  {executionResult.valid ? 'PASS' : 'FAIL'}
                </span>
              </div>

              {/* Metric Breakdown */}
              <div className="grid grid-cols-4 gap-2 pt-1">
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Scanned</span>
                  <span className="text-base font-bold text-slate-900">{parsedRows.length}</span>
                </div>
                <div className="p-2.5 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
                  <span className="text-[10px] text-emerald-700 uppercase tracking-wider block">Fixed</span>
                  <span className="text-base font-bold text-emerald-600">{executionResult.fixedCount ?? parsedRows.length}</span>
                </div>
                <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-center">
                  <span className="text-[10px] text-amber-700 uppercase tracking-wider block">Waiting</span>
                  <span className="text-base font-bold text-amber-600">{executionResult.waitingCount ?? 0}</span>
                </div>
                <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-200 text-center">
                  <span className="text-[10px] text-rose-700 uppercase tracking-wider block">Failed</span>
                  <span className="text-base font-bold text-rose-600">{executionResult.failedCount ?? 0}</span>
                </div>
              </div>

              {executionResult.isDryRun && (
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-[11px]">
                  Dry-run mode: Records were validated and tested against {cleanTag} without writing to database.
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold text-xs transition cursor-pointer"
          >
            {executionResult ? 'Close' : 'Cancel'}
          </button>

          <div className="flex items-center space-x-2">
            {executionResult ? (
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 bg-slate-900 hover:bg-black text-white rounded-xl font-semibold text-xs transition cursor-pointer shadow-xs flex items-center space-x-1.5"
              >
                <span>View Collected Transactions</span>
                <ArrowRight size={13} />
              </button>
            ) : (
              <button
                type="button"
                disabled={parsedRows.length === 0 || isExecuting || missingColumns.length > 0}
                onClick={handleExecute}
                className="px-5 py-2 bg-[#F27421] hover:bg-[#E06310] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-xs transition cursor-pointer shadow-xs flex items-center space-x-1.5"
              >
                {isExecuting ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Processing batch...</span>
                  </>
                ) : executionMode === 'DRY_RUN' ? (
                  <>
                    <Play size={13} />
                    <span>Run Pre-flight Test</span>
                  </>
                ) : (
                  <>
                    <Upload size={13} />
                    <span>Execute & Remediate ({parsedRows.length} Rows)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

export default HashtagFileUploadModal;

