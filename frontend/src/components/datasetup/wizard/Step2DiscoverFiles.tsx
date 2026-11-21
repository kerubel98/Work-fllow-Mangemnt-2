/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Folder, RefreshCw, FileText, CheckCircle2, Search, Filter, 
  FileSpreadsheet, ArrowRight, Eye, ShieldCheck, AlertCircle, FileCode,
  Table, Sparkles
} from 'lucide-react';
import { api } from '../../../api/client';

export interface DiscoveredFileItem {
  name: string;
  fullPath: string;
  size: number;
  modifiedAt?: string;
  fileType: 'CSV' | 'EXCEL' | 'DAT' | 'TXT' | 'XML' | 'OTHER';
}

export interface Step2DiscoverFilesProps {
  remotePath?: string;
  initialPattern?: string;
  initialFormat?: string;
  initialDelimiter?: string;
  connectionId?: string;
  connectionDetails?: {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    databaseName?: string;
  };
  onNext: (discoveryData: {
    remotePath: string;
    filePattern: string;
    fileFormat: string;
    delimiter: string;
    headerRowIndex: number;
    dataStartRow: number;
    discoveredHeaders: string[];
    sampleRows: Record<string, any>[];
    matchedFilesCount: number;
  }) => void;
  onBack: () => void;
}

export function Step2DiscoverFiles({
  remotePath = '/incoming/settlement/',
  initialPattern = 'SETTLE_*.csv',
  initialFormat = 'CSV',
  initialDelimiter = ',',
  connectionId,
  connectionDetails,
  onNext,
  onBack
}: Step2DiscoverFilesProps) {
  const [currentPath, setCurrentPath] = useState(remotePath);
  const [filePattern, setFilePattern] = useState(initialPattern);
  const [fileFormat, setFileFormat] = useState(initialFormat);
  const [delimiter, setDelimiter] = useState(initialDelimiter);
  const [headerRowIndex, setHeaderRowIndex] = useState(1);
  const [dataStartRow, setDataStartRow] = useState(2);

  const [isScanning, setIsScanning] = useState(false);
  const [selectedFileForInspection, setSelectedFileForInspection] = useState<string>('');

  // Discovered remote files list
  const [remoteFiles, setRemoteFiles] = useState<DiscoveredFileItem[]>([]);

  // Detected Headers and Sample Data Preview
  const [sampleHeaders, setSampleHeaders] = useState<string[]>([
    'trans_id', 'source_account', 'destination_account', 'amount', 
    'currency', 'channel', 'rrn', 'auth_code', 'status', 'settlement_date'
  ]);

  const [sampleRows, setSampleRows] = useState<Record<string, any>[]>([
    {
      trans_id: 'TRX-948102',
      source_account: 'ACC-100293182',
      destination_account: 'ACC-509124810',
      amount: '1,450.00',
      currency: 'ETB',
      channel: 'ATM_SWITCH',
      rrn: '0029148019',
      auth_code: 'AUTH_001',
      status: 'CLEARED',
      settlement_date: '2026-11-05'
    },
    {
      trans_id: 'TRX-948103',
      source_account: 'ACC-100293183',
      destination_account: 'ACC-509124811',
      amount: '22,900.50',
      currency: 'ETB',
      channel: 'POS_TERMINAL',
      rrn: '0029148020',
      auth_code: 'AUTH_002',
      status: 'CLEARED',
      settlement_date: '2026-11-05'
    },
    {
      trans_id: 'TRX-948104',
      source_account: 'ACC-100293184',
      destination_account: 'ACC-509124812',
      amount: '350.00',
      currency: 'ETB',
      channel: 'MOBILE_PAY',
      rrn: '0029148021',
      auth_code: 'AUTH_003',
      status: 'PENDING_RECON',
      settlement_date: '2026-11-05'
    }
  ]);

  // Try real API discovery if connectionId or connectionDetails provided
  useEffect(() => {
    let isMounted = true;
    if (connectionId || connectionDetails?.host) {
      setIsScanning(true);
      api.discoverFtpFilesRecursive(connectionId || '', currentPath, connectionDetails)
        .then(files => {
          if (isMounted && Array.isArray(files) && files.length > 0) {
            setRemoteFiles(files.map(f => ({
              name: f.name,
              fullPath: f.fullPath,
              size: f.size,
              modifiedAt: f.modifiedAt,
              fileType: f.fileType as any || 'CSV'
            })));
            setSelectedFileForInspection(files[0].name);
          }
        })
        .catch(err => {
          console.warn('Live FTP scan notice:', err);
        })
        .finally(() => {
          if (isMounted) setIsScanning(false);
        });
    }
    return () => { isMounted = false; };
  }, [connectionId, currentPath, connectionDetails?.host, connectionDetails?.port, connectionDetails?.username]);

  // Live inspection and real preview parsing when a remote file is selected
  useEffect(() => {
    if (!selectedFileForInspection || (!connectionId && !connectionDetails?.host)) return;
    const target = remoteFiles.find(f => f.name === selectedFileForInspection);
    const fullPath = target?.fullPath || selectedFileForInspection;
    const isXls = selectedFileForInspection.endsWith('.xls') || selectedFileForInspection.endsWith('.xlsx') || target?.fileType === 'EXCEL';
    if (isXls) setFileFormat('EXCEL');

    const configPayload = {
      sourceDirectoryPath: currentPath,
      sampleFilePath: fullPath,
      sampleFileName: fullPath,
      fileNamePattern: filePattern || selectedFileForInspection,
      fileFormat: isXls ? 'EXCEL' : fileFormat,
      fileType: isXls ? 'EXCEL' : fileFormat,
      delimiter: delimiter === '\\t' ? '\t' : delimiter,
      hasHeaders: true,
      headerRowIndex,
      dataStartRow
    };

    api.testFtpPreviewParse(connectionId || '', configPayload, connectionDetails)
      .then(async (res) => {
        if (res && res.headersDetected && res.headersDetected.length > 0) {
          setSampleHeaders(res.headersDetected);
          if (res.parsedRowsSample && res.parsedRowsSample.length > 0) {
            setSampleRows(res.parsedRowsSample);
          }
          if (res.headerRowIndex && res.headerRowIndex !== headerRowIndex) {
            setHeaderRowIndex(res.headerRowIndex);
          }
          if (res.dataStartRow && res.dataStartRow !== dataStartRow) {
            setDataStartRow(res.dataStartRow);
          }
          if (res.fileType === 'EXCEL') {
            setFileFormat('EXCEL');
          }
        } else {
          // Fallback structure inspection
          const structRes = await api.inspectFtpStructure(connectionId || '', fullPath, connectionDetails).catch(() => null);
          if (structRes) {
            if (structRes.suggestedHeaderRow) setHeaderRowIndex(structRes.suggestedHeaderRow);
            if (structRes.suggestedDataStartRow) setDataStartRow(structRes.suggestedDataStartRow);
            if (structRes.fileType === 'EXCEL') setFileFormat('EXCEL');
            const detectedHeaders = (structRes as any).headersDetected || (structRes.sampleLines && structRes.sampleLines.length > 0
              ? structRes.sampleLines[0].split(structRes.detectedDelimiter || delimiter || ',').map((s: string) => s.trim().replace(/^["']|["']$/g, ''))
              : []);
            if (detectedHeaders.length > 0) {
              setSampleHeaders(detectedHeaders);
            }
          }
        }
      })
      .catch(err => {
        console.warn('Live test parse notice in wizard:', err);
      });
  }, [selectedFileForInspection, connectionId, currentPath, connectionDetails?.host]);

  // Pattern matcher
  const matchedFiles = useMemo(() => {
    if (!filePattern.trim() || filePattern === '*') return remoteFiles;
    const regexPattern = new RegExp('^' + filePattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$', 'i');
    return remoteFiles.filter(f => regexPattern.test(f.name));
  }, [remoteFiles, filePattern]);

  const handleScanDirectory = async () => {
    setIsScanning(true);
    try {
      if (connectionId || connectionDetails?.host) {
        const files = await api.discoverFtpFilesRecursive(connectionId || '', currentPath, connectionDetails);
        if (Array.isArray(files) && files.length > 0) {
          setRemoteFiles(files.map(f => ({
            name: f.name,
            fullPath: f.fullPath,
            size: f.size,
            modifiedAt: f.modifiedAt,
            fileType: f.fileType as any || 'CSV'
          })));
        }
      }
    } catch (e) {
      console.warn('Scan notice:', e);
    } finally {
      setIsScanning(false);
    }
  };

  const handleContinue = () => {
    onNext({
      remotePath: currentPath,
      filePattern,
      fileFormat,
      delimiter,
      headerRowIndex,
      dataStartRow,
      discoveredHeaders: sampleHeaders,
      sampleRows,
      matchedFilesCount: matchedFiles.length
    });
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-8 text-xs text-slate-800 overflow-y-auto">
      <div className="max-w-4xl space-y-6">
        <div>
          <h2 className="text-sm font-bold text-slate-900 font-mono">
            Discover Remote Files & Configure File Matching
          </h2>
          <p className="text-slate-500 mt-1 leading-relaxed">
            Scan the SFTP server directory to discover incoming files. Configure pattern matching and inspect file structure before mapping to local database tables.
          </p>
        </div>

        {/* Remote Path & Scan Bar */}
        <div className="p-4 bg-slate-50/80 border border-slate-200/90 rounded-2xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5 flex-1 min-w-[280px]">
            <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#F97316] flex items-center justify-center shrink-0">
              <Folder size={16} />
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                Remote SFTP Directory Path
              </label>
              <input
                type="text"
                value={currentPath}
                onChange={(e) => setCurrentPath(e.target.value)}
                className="w-full bg-white px-3 py-1.5 border border-slate-200 rounded-lg font-mono text-xs text-slate-800 focus:outline-none focus:border-[#F97316]"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleScanDirectory}
            disabled={isScanning}
            className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold font-mono text-xs flex items-center space-x-1.5 transition cursor-pointer shadow-2xs"
          >
            <RefreshCw size={13} className={isScanning ? 'animate-spin text-[#F97316]' : 'text-slate-500'} />
            <span>{isScanning ? 'Scanning...' : 'Scan Directory'}</span>
          </button>
        </div>

        {/* Discovered Files Table */}
        <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
          <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <FileText size={15} className="text-slate-500" />
              <span className="font-bold text-slate-900 font-mono text-xs">
                Discovered Remote Files ({remoteFiles.length})
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/70 font-semibold flex items-center gap-1">
                <CheckCircle2 size={11} />
                <span>{matchedFiles.length} match pattern</span>
              </span>
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
            {remoteFiles.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                {isScanning ? 'Scanning remote directory...' : 'No files discovered in this path yet. Click Scan Directory.'}
              </div>
            ) : (
              remoteFiles.map((file) => {
                const isMatched = matchedFiles.some(m => m.name === file.name);
                const isSelected = selectedFileForInspection === file.name;
                return (
                  <div
                    key={file.name}
                    onClick={() => setSelectedFileForInspection(file.name)}
                    className={`px-5 py-2.5 flex items-center justify-between text-xs transition cursor-pointer ${
                      isSelected ? 'bg-orange-50/40 border-l-4 border-l-[#F97316]' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center space-x-3 min-w-0">
                      <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 text-slate-600">
                        {file.fileType === 'EXCEL' ? <FileSpreadsheet size={13} className="text-emerald-600" /> : <FileText size={13} />}
                      </div>
                      <div className="truncate">
                        <span className={`font-mono text-xs ${isMatched ? 'font-bold text-slate-900' : 'text-slate-500'}`}>
                          {file.name}
                        </span>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {(file.size / 1024).toFixed(1)} KB · Modified {file.modifiedAt || 'Today'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        {file.fileType}
                      </span>
                      {isMatched ? (
                        <span className="text-[10px] font-mono text-emerald-600 font-bold">Matches pattern</span>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-400">Ignored</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Pattern & Parsing Rules Configuration */}
        <div className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center space-x-2">
            <Sparkles size={14} className="text-[#F97316]" />
            <span className="font-bold text-slate-900 font-mono text-xs">
              File Pattern & Delimiter Rules
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="text-[11px] font-mono font-semibold text-slate-700 block mb-1">
                File Matching Pattern
              </label>
              <input
                type="text"
                value={filePattern}
                onChange={(e) => setFilePattern(e.target.value)}
                placeholder="SETTLE_*.csv"
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-800 focus:outline-none focus:bg-white"
              />
              <span className="text-[10px] text-slate-400 font-mono mt-0.5 block">Glob pattern: e.g. *.csv</span>
            </div>

            <div>
              <label className="text-[11px] font-mono font-semibold text-slate-700 block mb-1">
                File Format
              </label>
              <select
                value={fileFormat}
                onChange={(e) => setFileFormat(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-800 focus:outline-none focus:bg-white cursor-pointer"
              >
                <option value="CSV">CSV (Delimited)</option>
                <option value="EXCEL">Excel (.xlsx / .xls)</option>
                <option value="DAT">Pipe / Data file (.dat)</option>
                <option value="TXT">Plain text (.txt)</option>
                <option value="XML">XML Feed</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-mono font-semibold text-slate-700 block mb-1">
                Delimiter
              </label>
              <select
                value={delimiter}
                onChange={(e) => setDelimiter(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-800 focus:outline-none focus:bg-white cursor-pointer"
              >
                <option value=",">Comma (,)</option>
                <option value=";">Semicolon (;)</option>
                <option value="|">Pipe (|)</option>
                <option value="\t">Tab (\t)</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-mono font-semibold text-slate-700 block mb-1">
                Header / Data Rows
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min={1}
                  value={headerRowIndex}
                  onChange={(e) => setHeaderRowIndex(Number(e.target.value))}
                  title="Header row index"
                  className="w-16 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-center"
                />
                <span className="text-slate-400 font-mono">Header</span>
                <input
                  type="number"
                  min={2}
                  value={dataStartRow}
                  onChange={(e) => setDataStartRow(Number(e.target.value))}
                  title="Data start row index"
                  className="w-16 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-center"
                />
                <span className="text-slate-400 font-mono">Data</span>
              </div>
            </div>
          </div>
        </div>

        {/* Sample Inspection Preview Card */}
        <div className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Table size={14} className="text-slate-500" />
              <span className="font-bold text-slate-900 font-mono text-xs">
                Parsed File Structure Preview: <span className="text-blue-600">{selectedFileForInspection}</span>
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              {sampleHeaders.length} columns detected · First 3 rows sampled
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl bg-slate-50/30">
            <table className="w-full text-left font-mono text-[11px]">
              <thead className="bg-slate-100/80 border-b border-slate-200 text-slate-600">
                <tr>
                  {sampleHeaders.map((hdr) => (
                    <th key={hdr} className="py-2 px-3 whitespace-nowrap font-bold">
                      {hdr}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 bg-white">
                {sampleRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    {sampleHeaders.map((hdr) => (
                      <td key={hdr} className="py-2 px-3 whitespace-nowrap text-slate-700">
                        {row[hdr]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="pt-6 border-t border-slate-200 flex items-center justify-between bg-white shrink-0 mt-6">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl font-semibold text-xs transition cursor-pointer"
        >
          Back
        </button>

        <button
          type="button"
          onClick={handleContinue}
          className="px-5 py-2 bg-[#F97316] hover:bg-orange-600 text-white rounded-xl font-bold font-mono text-xs flex items-center space-x-1.5 transition cursor-pointer shadow-xs"
        >
          <span>Continue to Target Local Table</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

