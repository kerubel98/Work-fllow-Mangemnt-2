/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, Pause, Play, RefreshCw, XCircle, 
  CheckCircle2, Clock, Activity, ChevronRight, WifiOff 
} from 'lucide-react';

interface BatchInfo {
  id: number;
  name: string;
  status: 'Completed' | 'Running' | 'Paused';
  statusLabel?: string;
  completed: number;
  total: number;
}

interface StreamingResult {
  id: string;
  status: 'Pass' | 'Fail' | 'Error' | 'Not Evaluated';
  action: 'Continue' | 'Flag' | 'Stop' | '—';
}

interface InvestigationRunningViewProps {
  caseId?: string;
  caseTitle?: string;
  workflowName?: string;
  startedTimeAgo?: string;
  onPause?: () => void;
  onCancel?: () => void;
  onSelectTransaction?: (txnId: string) => void;
  onCloseView?: () => void;
}

export const InvestigationRunningView: React.FC<InvestigationRunningViewProps> = ({
  caseId = 'ISS-1792258589203-7468',
  caseTitle = 'Reconcile Clearing Batch Feed',
  workflowName = 'New Validation Pipeline',
  startedTimeAgo = 'started 2 min ago',
  onPause,
  onCancel,
  onSelectTransaction,
  onCloseView
}) => {
  const [isPaused, setIsPaused] = useState(false);
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);

  const [batches, setBatches] = useState<BatchInfo[]>([
    { id: 1, name: 'Batch 1', status: 'Completed', completed: 100, total: 100 },
    { id: 2, name: 'Batch 2', status: 'Completed', completed: 100, total: 100 },
    { id: 3, name: 'Batch 3', status: 'Completed', completed: 100, total: 100 },
    { id: 4, name: 'Batch 4', status: 'Running', completed: 20, total: 100 },
    { id: 5, name: 'Batch 5', status: 'Paused', statusLabel: 'Paused · database offline', completed: 0, total: 100 },
  ]);

  const [liveResults, setLiveResults] = useState<StreamingResult[]>([
    { id: 'TXN-9001', status: 'Pass', action: 'Continue' },
    { id: 'TXN-9002', status: 'Fail', action: 'Flag' },
    { id: 'TXN-9003', status: 'Pass', action: 'Continue' },
    { id: 'TXN-9004', status: 'Fail', action: 'Flag' },
    { id: 'TXN-9005', status: 'Error', action: 'Stop' },
    { id: 'TXN-9006', status: 'Pass', action: 'Continue' },
    { id: 'TXN-9007', status: 'Not Evaluated', action: '—' },
  ]);

  const handleTestConnection = () => {
    setIsTestingConn(true);
    setTimeout(() => {
      setIsTestingConn(false);
      setTestSuccess('SettlemFTP connection tested: Connection failed (Host unreachable on port 21)');
      setTimeout(() => setTestSuccess(null), 4000);
    }, 800);
  };

  const handleRetryBatch = (batchId: number) => {
    setBatches(prev => prev.map(b => b.id === batchId ? { ...b, status: 'Running', statusLabel: undefined } : b));
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F8FAFC] text-slate-800 font-sans overflow-y-auto no-scrollbar p-6 space-y-6">
      {/* Top Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          {/* Status Dot + Case ID */}
          <div className="flex items-center space-x-2 text-xs font-mono mb-1">
            <span className="flex items-center space-x-1.5 text-amber-600 font-bold">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span>{isPaused ? 'Paused' : 'Running'}</span>
            </span>
            <span className="text-slate-400">·</span>
            <span className="text-slate-500 font-semibold">{caseId}</span>
          </div>

          <h1 className="text-2xl font-bold font-heading text-slate-900 tracking-tight">{caseTitle}</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Workflow <span className="font-semibold text-slate-700">{workflowName}</span> · {startedTimeAgo}
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex items-center space-x-2 shrink-0">
          <button 
            type="button"
            onClick={() => {
              setIsPaused(p => !p);
              if (onPause) onPause();
            }}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 transition cursor-pointer shadow-2xs flex items-center space-x-1.5"
          >
            {isPaused ? <Play size={13} className="fill-slate-700" /> : <Pause size={13} className="fill-slate-700" />}
            <span>{isPaused ? 'Resume' : 'Pause'}</span>
          </button>

          <button 
            type="button"
            onClick={onCancel || onCloseView}
            className="px-4 py-2 bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs"
          >
            Cancel run
          </button>
        </div>
      </div>

      {/* Offline Alert Banner */}
      <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-start space-x-3.5">
          <div className="p-1 rounded-full bg-rose-100 text-rose-600 shrink-0 mt-0.5">
            <AlertTriangle size={18} />
          </div>
          <div>
            <div className="text-sm font-bold text-rose-900">SettlemFTP is offline</div>
            <div className="text-xs text-rose-700 mt-0.5">
              Batch 5 is paused. Cached results are not reused for paused rows. Retry once the connection is restored.
            </div>
            {testSuccess && (
              <div className="text-xs font-mono font-bold text-rose-800 mt-1">{testSuccess}</div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button 
            type="button"
            onClick={handleTestConnection}
            disabled={isTestingConn}
            className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer shadow-2xs flex items-center space-x-1.5"
          >
            {isTestingConn && <RefreshCw size={12} className="animate-spin text-slate-400" />}
            <span>Test connection</span>
          </button>

          <button 
            type="button"
            onClick={() => handleRetryBatch(5)}
            className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer shadow-2xs"
          >
            Retry batch 5
          </button>
        </div>
      </div>

      {/* 4 Metric KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Processed */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1">Processed</div>
          <div className="text-2xl font-bold font-heading text-slate-900">
            320 <span className="text-sm font-normal text-slate-400 font-sans">of 500</span>
          </div>
        </div>

        {/* Reconciled */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1">Reconciled</div>
          <div className="text-2xl font-bold font-heading text-emerald-600 flex items-baseline space-x-2">
            <span>291</span>
            <span className="text-xs font-semibold text-slate-400 font-sans">91%</span>
          </div>
        </div>

        {/* Flagged */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1">Flagged</div>
          <div className="text-2xl font-bold font-heading text-amber-500 flex items-baseline space-x-2">
            <span>24</span>
            <span className="text-xs font-normal text-slate-400 font-sans">needs review</span>
          </div>
        </div>

        {/* Errors */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1">Errors</div>
          <div className="text-2xl font-bold font-heading text-rose-500 flex items-baseline space-x-2">
            <span>5</span>
            <span className="text-xs font-normal text-slate-400 font-sans">technical</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Batches & Overall + Right Live Results */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (col-span-8) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Overall Progress Card */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm font-heading">Overall progress</h3>
              <span className="font-bold text-slate-900 text-sm font-mono">64%</span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-[#F27421] rounded-full transition-all duration-500"
                style={{ width: '64%' }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 font-sans">
              <span>Batch 4 of 5 · 100 transactions per batch</span>
              <span>About 1 min left</span>
            </div>
          </div>

          {/* Batches Table Card */}
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm font-heading">Batches</h3>
            </div>

            <table className="w-full border-collapse text-left text-xs font-sans">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-medium">
                  <th className="px-6 py-3 font-medium w-28">Batch</th>
                  <th className="px-6 py-3 font-medium w-48">Status</th>
                  <th className="px-6 py-3 font-medium">Progress</th>
                  <th className="px-6 py-3 font-medium w-20 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans text-xs">
                {batches.map(batch => (
                  <tr key={batch.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-3.5 font-bold text-slate-900">{batch.name}</td>
                    <td className="px-6 py-3.5">
                      {batch.status === 'Completed' ? (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          <span>Completed</span>
                        </span>
                      ) : batch.status === 'Running' ? (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-900 text-white">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                          <span>Running</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                          <span>{batch.statusLabel || 'Paused · database offline'}</span>
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center space-x-3">
                        <div className="w-32 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              batch.status === 'Completed' ? 'bg-emerald-500' :
                              batch.status === 'Running' ? 'bg-[#F27421]' : 'bg-slate-300'
                            }`}
                            style={{ width: `${(batch.completed / batch.total) * 100}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-mono text-slate-500">
                          {batch.completed} / {batch.total}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      {batch.status === 'Paused' && (
                        <button 
                          type="button"
                          onClick={() => handleRetryBatch(batch.id)}
                          className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-2xs transition cursor-pointer"
                        >
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Live Results Streaming (col-span-4) */}
        <div className="lg:col-span-4 bg-white border border-slate-200/80 rounded-2xl shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-900 text-sm font-heading">Live results</h3>
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Streaming</span>
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {liveResults.map(item => (
              <div 
                key={item.id}
                onClick={() => onSelectTransaction && onSelectTransaction(item.id)}
                className="py-3 flex items-center justify-between cursor-pointer hover:bg-slate-50/80 px-2 rounded-xl transition"
              >
                <span className="font-mono font-bold text-xs text-slate-900">{item.id}</span>
                <div className="flex items-center space-x-3">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    item.status === 'Pass' ? 'bg-emerald-50 text-emerald-700' :
                    item.status === 'Fail' ? 'bg-rose-50 text-rose-700' :
                    item.status === 'Error' ? 'bg-amber-50 text-amber-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {item.status}
                  </span>
                  <span className="text-xs text-slate-400 w-14 text-right">{item.action}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvestigationRunningView;
