/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Clock, ShieldAlert, ArrowRight, CheckCircle2, 
  RefreshCw, Settings, FolderCheck, Bell, ShieldCheck, Database
} from 'lucide-react';

export interface Step4IngestionPolicyProps {
  initialSchedule?: string;
  initialDeduplicationAction?: 'SKIP' | 'UPSERT';
  initialFileCleanup?: 'RETAIN' | 'MOVE_ARCHIVE' | 'RENAME_PROCESSED';
  onNext: (policyData: {
    scheduleMode: 'SCHEDULED' | 'ON_DEMAND';
    scheduleCron: string;
    deduplicationAction: 'SKIP' | 'UPSERT';
    fileCleanupAction: 'RETAIN' | 'MOVE_ARCHIVE' | 'RENAME_PROCESSED';
    archiveDir: string;
    maxBatchSize: number;
    alertOnFailure: boolean;
  }) => void;
  onBack: () => void;
}

export function Step4IngestionPolicy({
  initialSchedule = '0 2 * * *', // Daily 02:00 UTC
  initialDeduplicationAction = 'SKIP',
  initialFileCleanup = 'MOVE_ARCHIVE',
  onNext,
  onBack
}: Step4IngestionPolicyProps) {
  const [scheduleMode, setScheduleMode] = useState<'SCHEDULED' | 'ON_DEMAND'>('SCHEDULED');
  const [frequencyPreset, setFrequencyPreset] = useState<'HOURLY' | 'DAILY_0200' | 'EVERY_15M' | 'CUSTOM'>('DAILY_0200');
  const [scheduleCron, setScheduleCron] = useState(initialSchedule);
  const [deduplicationAction, setDeduplicationAction] = useState<'SKIP' | 'UPSERT'>(initialDeduplicationAction);
  const [fileCleanupAction, setFileCleanupAction] = useState<'RETAIN' | 'MOVE_ARCHIVE' | 'RENAME_PROCESSED'>(initialFileCleanup);
  const [archiveDir, setArchiveDir] = useState('/incoming/settlement/archive/');
  const [maxBatchSize, setMaxBatchSize] = useState(50000);
  const [alertOnFailure, setAlertOnFailure] = useState(true);

  const handlePresetChange = (preset: 'HOURLY' | 'DAILY_0200' | 'EVERY_15M' | 'CUSTOM') => {
    setFrequencyPreset(preset);
    if (preset === 'DAILY_0200') setScheduleCron('0 2 * * *');
    else if (preset === 'HOURLY') setScheduleCron('0 * * * *');
    else if (preset === 'EVERY_15M') setScheduleCron('*/15 * * * *');
  };

  const handleContinue = () => {
    onNext({
      scheduleMode,
      scheduleCron,
      deduplicationAction,
      fileCleanupAction,
      archiveDir,
      maxBatchSize,
      alertOnFailure
    });
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-8 text-xs text-slate-800 overflow-y-auto">
      <div className="max-w-4xl space-y-6">
        <div>
          <h2 className="text-sm font-bold text-slate-900 font-mono">
            Ingestion Schedule, Triggers & Deduplication Policy
          </h2>
          <p className="text-slate-500 mt-1 leading-relaxed">
            Configure how frequently remote files should be polled and inserted into the local database, how duplicates are handled, and post-processing file cleanup.
          </p>
        </div>

        {/* Polling Schedule & Mode */}
        <div className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center space-x-2">
            <Clock size={16} className="text-[#F97316]" />
            <span className="font-bold text-slate-900 font-mono text-xs">
              File Ingestion Trigger & Schedule
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setScheduleMode('SCHEDULED')}
              className={`p-3 rounded-xl border text-left text-xs font-mono transition cursor-pointer ${
                scheduleMode === 'SCHEDULED'
                  ? 'border-[#F97316] bg-orange-50/20 text-orange-950 font-bold'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-1.5">
                <Clock size={13} className={scheduleMode === 'SCHEDULED' ? 'text-[#F97316]' : 'text-slate-400'} />
                <span>Automated Polling Schedule</span>
              </div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                Periodic cron background worker scans & inserts
              </div>
            </button>

            <button
              type="button"
              onClick={() => setScheduleMode('ON_DEMAND')}
              className={`p-3 rounded-xl border text-left text-xs font-mono transition cursor-pointer ${
                scheduleMode === 'ON_DEMAND'
                  ? 'border-[#F97316] bg-orange-50/20 text-orange-950 font-bold'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-1.5">
                <RefreshCw size={13} className={scheduleMode === 'ON_DEMAND' ? 'text-[#F97316]' : 'text-slate-400'} />
                <span>On-Demand / Manual Ingest</span>
              </div>
              <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                Triggered via UI button, API webhook, or #hashtag
              </div>
            </button>
          </div>

          {scheduleMode === 'SCHEDULED' && (
            <div className="pt-2 border-t border-slate-100 space-y-3">
              <label className="text-[11px] font-mono font-bold text-slate-700 block">
                Polling Frequency
              </label>

              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'DAILY_0200', label: 'Daily at 02:00 UTC', sub: 'EOD batch cutoff' },
                  { id: 'HOURLY', label: 'Hourly', sub: 'Every 60 minutes' },
                  { id: 'EVERY_15M', label: 'Every 15 min', sub: 'Intraday clearing' },
                  { id: 'CUSTOM', label: 'Custom Cron', sub: 'Custom expression' }
                ].map(freq => (
                  <button
                    key={freq.id}
                    type="button"
                    onClick={() => handlePresetChange(freq.id as any)}
                    className={`p-2.5 rounded-xl border text-left text-xs font-mono transition cursor-pointer ${
                      frequencyPreset === freq.id
                        ? 'border-blue-600 bg-blue-50/50 text-blue-900 font-bold shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div>{freq.label}</div>
                    <div className="text-[10px] text-slate-400 font-normal">{freq.sub}</div>
                  </button>
                ))}
              </div>

              {frequencyPreset === 'CUSTOM' && (
                <div className="pt-2">
                  <input
                    type="text"
                    value={scheduleCron}
                    onChange={(e) => setScheduleCron(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-800"
                    placeholder="*/30 * * * *"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Deduplication & Post-Processing Policy */}
        <div className="p-5 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-4">
          <div className="flex items-center space-x-2">
            <ShieldCheck size={16} className="text-emerald-600" />
            <span className="font-bold text-slate-900 font-mono text-xs">
              Deduplication & Local Database Insertion Policy
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-mono font-bold text-slate-700 block mb-1">
                Duplicate Record Handling
              </label>
              <select
                value={deduplicationAction}
                onChange={(e) => setDeduplicationAction(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-800 focus:outline-none focus:bg-white cursor-pointer"
              >
                <option value="SKIP">Skip Duplicate (Strict ON CONFLICT DO NOTHING)</option>
                <option value="UPSERT">Update Existing (ON CONFLICT DO UPDATE)</option>
              </select>
              <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                Derived using 64-bit cryptographic advisory key
              </span>
            </div>

            <div>
              <label className="text-[11px] font-mono font-bold text-slate-700 block mb-1">
                Batch Buffer Limit
              </label>
              <input
                type="number"
                value={maxBatchSize}
                onChange={(e) => setMaxBatchSize(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs text-slate-800 focus:outline-none focus:bg-white"
              />
              <span className="text-[10px] text-slate-400 font-mono mt-1 block">
                Max rows parsed per run (caps composite params below 30,000)
              </span>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <label className="text-[11px] font-mono font-bold text-slate-700 block mb-1">
              Remote File Handling Post-Ingestion
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'MOVE_ARCHIVE', label: 'Move to Archive Folder', sub: 'Move on SFTP host' },
                { id: 'RENAME_PROCESSED', label: 'Rename .processed', sub: 'Append suffix' },
                { id: 'RETAIN', label: 'Retain As-Is', sub: 'Leave remote file untouched' }
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setFileCleanupAction(opt.id as any)}
                  className={`p-2.5 rounded-xl border text-left text-xs font-mono transition cursor-pointer ${
                    fileCleanupAction === opt.id
                      ? 'border-[#F97316] bg-orange-50/20 text-orange-950 font-bold'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div>{opt.label}</div>
                  <div className="text-[10px] text-slate-400 font-normal">{opt.sub}</div>
                </button>
              ))}
            </div>

            {fileCleanupAction === 'MOVE_ARCHIVE' && (
              <div className="mt-2.5">
                <label className="text-[10px] font-mono text-slate-400 block mb-0.5">
                  Remote Archive Subdirectory
                </label>
                <input
                  type="text"
                  value={archiveDir}
                  onChange={(e) => setArchiveDir(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-xs text-slate-800"
                />
              </div>
            )}
          </div>
        </div>

        {/* Error Alerting Notification Toggle */}
        <div className="p-4 bg-slate-50/70 border border-slate-200/80 rounded-2xl flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
              <Bell size={15} />
            </div>
            <div>
              <div className="font-bold text-slate-900 font-mono text-xs">
                Operational Alerting on Ingest Errors
              </div>
              <div className="text-[11px] text-slate-500 font-mono">
                Notify assigned operations team if remote file fails connection or contains corrupt rows
              </div>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={alertOnFailure}
              onChange={(e) => setAlertOnFailure(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#F97316]"></div>
          </label>
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
          <span>Continue to Test Ingest & Activate</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

