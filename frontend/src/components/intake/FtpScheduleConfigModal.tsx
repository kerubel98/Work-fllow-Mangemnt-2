/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  X, Clock, Calendar, Check, Play, AlertCircle, Shield,
  Server, RefreshCw, Zap, Layers, FileText, CheckCircle2
} from 'lucide-react';
import { FtpFileStagingConfig, FtpStagingScheduleConfig, FileIngestionMappingTemplate } from '../../types';
import { api } from '../../api/client';

interface FtpScheduleConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: FtpFileStagingConfig | null;
  onSaved: (updatedConfig: FtpFileStagingConfig) => void;
  onInitiateAfterSave?: (config: FtpFileStagingConfig) => void;
}

export const FtpScheduleConfigModal: React.FC<FtpScheduleConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaved,
  onInitiateAfterSave
}) => {
  const [enabled, setEnabled] = useState(true);
  const [frequency, setFrequency] = useState<FtpStagingScheduleConfig['frequency']>('DAILY');
  const [scheduledTime, setScheduledTime] = useState('02:00');
  const [scheduleCron, setScheduleCron] = useState('0 2 * * *');
  const [targetType, setTargetType] = useState<'ALL' | 'CSV' | 'EXCEL' | 'XML' | 'TXT'>('ALL');
  const [deduplicationPolicy, setDeduplicationPolicy] = useState<'SKIP' | 'UPDATE'>('SKIP');
  const [mappingTemplateId, setMappingTemplateId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<FileIngestionMappingTemplate[]>([]);
  
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    api.getFileMappingTemplates().then(res => {
      if (Array.isArray(res)) setTemplates(res);
    }).catch(console.warn);
  }, []);

  useEffect(() => {
    if (config) {
      const sched = config.scheduleConfig;
      setEnabled(sched?.enabled !== false);
      setFrequency(sched?.frequency || 'DAILY');
      setScheduledTime(sched?.scheduledTime || '02:00');
      setScheduleCron(sched?.scheduleCron || '0 2 * * *');
      setTargetType((sched?.targetType as any) || 'ALL');
      setDeduplicationPolicy(sched?.deduplicationPolicy || 'SKIP');
      setMappingTemplateId(config.mappingTemplateId || null);
      setErrorMsg(null);
    }
  }, [config, isOpen]);

  if (!isOpen || !config) return null;

  const handleSave = async (andInitiate = false) => {
    setIsSaving(true);
    setErrorMsg(null);

    try {
      const updatedSchedule: FtpStagingScheduleConfig = {
        enabled,
        frequency,
        scheduledTime: frequency === 'DAILY' ? scheduledTime : undefined,
        scheduleCron: frequency === 'CUSTOM_CRON' ? scheduleCron : undefined,
        targetType,
        deduplicationPolicy,
        lastRunAt: config.scheduleConfig?.lastRunAt,
        nextRunAt: calculateNextRun(frequency, scheduledTime, scheduleCron)
      };

      const updated = await api.updateFtpStagingConfig(config.id, {
        scheduleConfig: updatedSchedule,
        mappingTemplateId: mappingTemplateId || undefined
      });

      onSaved(updated || { ...config, scheduleConfig: updatedSchedule, mappingTemplateId: mappingTemplateId || undefined });

      if (andInitiate && onInitiateAfterSave) {
        onInitiateAfterSave(updated || { ...config, scheduleConfig: updatedSchedule });
      }

      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save FTP schedule configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const calculateNextRun = (freq: string, time: string, cron: string) => {
    const now = new Date();
    if (freq === 'MANUAL') return undefined;
    if (freq === 'EVERY_15_MIN') {
      return new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    }
    if (freq === 'HOURLY') {
      return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    }
    if (freq === 'DAILY') {
      const [hours, mins] = (time || '02:00').split(':').map(Number);
      const next = new Date();
      next.setUTCHours(hours || 2, mins || 0, 0, 0);
      if (next <= now) {
        next.setUTCDate(next.getUTCDate() + 1);
      }
      return next.toISOString();
    }
    return new Date(now.getTime() + 3600 * 1000).toISOString();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-slate-900 to-[#18203d] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center text-[#F27421]">
              <Clock size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold font-heading text-white tracking-tight flex items-center gap-2">
                <span>FTP Ingestion Schedule</span>
                <span className="text-[11px] font-normal px-2 py-0.5 rounded-full bg-white/10 text-slate-200 border border-white/10">
                  Operational Intake
                </span>
              </h3>
              <p className="text-xs text-slate-300 font-sans mt-0.5">
                Automate recurring clearing feed intake and polling intervals without admin privileges.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 font-sans max-h-[75vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle size={15} className="text-rose-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Target Feed Identity Strip */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Target Feed</span>
              <p className="font-bold text-slate-900 flex items-center gap-1.5">
                <Server size={13} className="text-slate-500" />
                <span>{config.name}</span>
              </p>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Pattern</span>
              <p className="font-mono text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200 font-semibold">
                {config.fileNamePattern}
              </p>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Target Mirror Table</span>
              <p className="font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold">
                {config.stagingTableName || 'mirror_ftp_*'}
              </p>
            </div>
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Format</span>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                {config.fileFormat || 'EXCEL'}
              </span>
            </div>
          </div>

          {/* Master Enable / Pause Toggle */}
          <div className="flex items-center justify-between p-4 bg-white border border-slate-200/80 rounded-xl shadow-2xs">
            <div>
              <h4 className="text-sm font-bold text-slate-900 font-heading">Automated Ingestion State</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                When enabled, the backend scheduler will automatically poll and stage new files on this schedule.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                enabled ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  enabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Schedule Frequency Radio Cards */}
          <div className="space-y-2.5">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
              Schedule Mode & Frequency
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Daily Settlement */}
              <div
                onClick={() => setFrequency('DAILY')}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer space-y-1.5 ${
                  frequency === 'DAILY'
                    ? 'border-[#F27421] bg-orange-50/50 ring-1 ring-[#F27421]'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                    <Calendar size={14} className={frequency === 'DAILY' ? 'text-[#F27421]' : 'text-slate-400'} />
                    Daily Settlement Run
                  </span>
                  {frequency === 'DAILY' && <Check size={14} className="text-[#F27421]" />}
                </div>
                <p className="text-[11px] text-slate-500">
                  Runs once daily at bank clearing window cutoff time (UTC).
                </p>
              </div>

              {/* Hourly Polling */}
              <div
                onClick={() => setFrequency('HOURLY')}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer space-y-1.5 ${
                  frequency === 'HOURLY'
                    ? 'border-[#F27421] bg-orange-50/50 ring-1 ring-[#F27421]'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                    <Clock size={14} className={frequency === 'HOURLY' ? 'text-[#F27421]' : 'text-slate-400'} />
                    Hourly Polling
                  </span>
                  {frequency === 'HOURLY' && <Check size={14} className="text-[#F27421]" />}
                </div>
                <p className="text-[11px] text-slate-500">
                  Continuously polls remote SFTP every 60 minutes for new batches.
                </p>
              </div>

              {/* Intraday 15 min */}
              <div
                onClick={() => setFrequency('EVERY_15_MIN')}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer space-y-1.5 ${
                  frequency === 'EVERY_15_MIN'
                    ? 'border-[#F27421] bg-orange-50/50 ring-1 ring-[#F27421]'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                    <Zap size={14} className={frequency === 'EVERY_15_MIN' ? 'text-[#F27421]' : 'text-slate-400'} />
                    Intraday (15 Minutes)
                  </span>
                  {frequency === 'EVERY_15_MIN' && <Check size={14} className="text-[#F27421]" />}
                </div>
                <p className="text-[11px] text-slate-500">
                  Rapid high-frequency polling during active reconciliation windows.
                </p>
              </div>

              {/* Custom Cron */}
              <div
                onClick={() => setFrequency('CUSTOM_CRON')}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer space-y-1.5 ${
                  frequency === 'CUSTOM_CRON'
                    ? 'border-[#F27421] bg-orange-50/50 ring-1 ring-[#F27421]'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                    <Layers size={14} className={frequency === 'CUSTOM_CRON' ? 'text-[#F27421]' : 'text-slate-400'} />
                    Custom Cron Schedule
                  </span>
                  {frequency === 'CUSTOM_CRON' && <Check size={14} className="text-[#F27421]" />}
                </div>
                <p className="text-[11px] text-slate-500">
                  Configurable cron expression for custom enterprise operational schedules.
                </p>
              </div>

              {/* Manual On-Demand */}
              <div
                onClick={() => setFrequency('MANUAL')}
                className={`sm:col-span-2 p-3 rounded-xl border transition-all cursor-pointer space-y-1 ${
                  frequency === 'MANUAL'
                    ? 'border-slate-800 bg-slate-50 ring-1 ring-slate-800'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                    <Play size={13} className="text-slate-500" />
                    Manual / On-Demand Only
                  </span>
                  {frequency === 'MANUAL' && <Check size={14} className="text-slate-800" />}
                </div>
                <p className="text-[11px] text-slate-500">
                  Automated recurring polling is disabled. Files will only be staged when an operator clicks "Initiate Intake".
                </p>
              </div>
            </div>
          </div>

          {/* Conditional Time Picker for Daily */}
          {frequency === 'DAILY' && (
            <div className="p-4 bg-orange-50/40 border border-orange-200/60 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800">
                  Clearing Window Cutoff Time (UTC)
                </label>
                <span className="text-[11px] text-slate-500">Current Server UTC</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="time"
                  value={scheduledTime}
                  onChange={e => setScheduledTime(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-semibold font-mono text-slate-900 focus:outline-none focus:border-[#F27421] focus:ring-1 focus:ring-[#F27421]"
                />
                <div className="flex items-center gap-1.5 flex-wrap">
                  {['02:00', '06:00', '18:00', '23:30'].map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setScheduledTime(t)}
                      className={`px-2.5 py-1 text-[11px] font-mono rounded-md border transition cursor-pointer ${
                        scheduledTime === t
                          ? 'bg-[#F27421] text-white border-[#F27421]'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {t} UTC
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Conditional Cron Input for Custom Cron */}
          {frequency === 'CUSTOM_CRON' && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
              <label className="text-xs font-bold text-slate-800 block">
                Cron Expression
              </label>
              <input
                type="text"
                value={scheduleCron}
                onChange={e => setScheduleCron(e.target.value)}
                placeholder="0 2 * * *"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:border-[#F27421]"
              />
              <p className="text-[11px] text-slate-500 font-sans">
                Syntax: <code>minute hour day month weekday</code>. Example: <code>0 2 * * *</code> (Daily at 02:00), <code>*/30 * * * *</code> (Every 30 min).
              </p>
            </div>
          )}

          {/* Linked Mapping & Recipe Template */}
          <div className="space-y-2 p-3.5 bg-slate-50/80 rounded-xl border border-slate-200">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
              Executable Recipe & Mapping Template
            </label>
            <select
              value={mappingTemplateId || ''}
              onChange={e => setMappingTemplateId(e.target.value || null)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:border-[#F27421]"
            >
              <option value="">No Recipe Template (Raw Feed Staging)</option>
              {templates.map(tpl => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name} ({Object.keys(tpl.columnMappings || {}).length} columns mapped, {(tpl.orderedRecipeSteps || []).length} recipe steps)
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 font-sans">
              When automated intake runs, the backend recipe execution engine will execute preamble slicing, splits, merges, value translations, amount/date cleanings, and canonical column mappings before staging records into mirror tables.
            </p>
          </div>

          {/* Deduplication & Conflict Policy */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block">
              Duplicate Record & Conflict Policy
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <label
                className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition ${
                  deduplicationPolicy === 'SKIP'
                    ? 'border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-500'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="dedupePolicy"
                  value="SKIP"
                  checked={deduplicationPolicy === 'SKIP'}
                  onChange={() => setDeduplicationPolicy('SKIP')}
                  className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <span className="font-bold text-xs text-slate-900 block">Skip Previously Ingested</span>
                  <span className="text-[11px] text-slate-500 leading-tight block mt-0.5">
                    Checks persistent <code className="font-mono text-slate-700">ftp_ingested_files</code> ledger to eliminate duplicate records.
                  </span>
                </div>
              </label>

              <label
                className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition ${
                  deduplicationPolicy === 'UPDATE'
                    ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="dedupePolicy"
                  value="UPDATE"
                  checked={deduplicationPolicy === 'UPDATE'}
                  onChange={() => setDeduplicationPolicy('UPDATE')}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="font-bold text-xs text-slate-900 block">Re-parse & Overwrite</span>
                  <span className="text-[11px] text-slate-500 leading-tight block mt-0.5">
                    Refreshes staging mirror rows even if the file name was already recorded.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* Last Run & Health Information */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <Shield size={14} className="text-slate-400" />
              <span>Audit: Changes persist directly to PostgreSQL <code className="font-mono text-slate-700">ftp_file_staging_configs</code></span>
            </span>
            {config.scheduleConfig?.lastRunAt && (
              <span className="text-slate-500 text-[11px]">
                Last Run: {new Date(config.scheduleConfig.lastRunAt).toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold font-sans transition cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSave(false)}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold font-sans transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
            >
              {isSaving ? (
                <>
                  <RefreshCw size={13} className="animate-spin text-[#F27421]" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check size={14} />
                  <span>Save Schedule</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleSave(true)}
              className="px-4 py-2 bg-[#F27421] hover:bg-[#e06516] text-white rounded-xl text-xs font-semibold font-sans transition flex items-center gap-1.5 cursor-pointer shadow-xs"
            >
              <Play size={13} className="fill-white" />
              <span>Save & Initiate Intake</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
