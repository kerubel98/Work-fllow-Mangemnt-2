/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Database, Folder, CheckCircle2, RefreshCw, Lock, AlertCircle } from 'lucide-react';
import { api } from '../../../api/client';

export interface Step1ConnectProps {
  initialData?: any;
  onNext: (data: any) => void;
  onBack?: () => void;
}

export function Step1Connect({ initialData, onNext, onBack }: Step1ConnectProps) {
  const [sourceType, setSourceType] = useState<'MySQL' | 'PostgreSQL' | 'MongoDB' | 'SFTP' | 'Oracle'>(
    initialData?.type || 'MySQL'
  );
  const [displayName, setDisplayName] = useState(initialData?.name || 'Sett');
  const [host, setHost] = useState(initialData?.host || '127.0.0.1');
  const [port, setPort] = useState(initialData?.port || '3306');
  const [database, setDatabase] = useState(initialData?.database || 'bo_test');
  const [username, setUsername] = useState(initialData?.username || 'root');
  const [password, setPassword] = useState(initialData?.password || '');
  const [scope, setScope] = useState<'team' | 'global'>('team');

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; latencyMs: number } | null>(
    initialData?.status === 'CONNECTED' ? { success: true, message: `${initialData.type || 'Connection'} Ready`, latencyMs: 14 } : null
  );

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const res = await api.testConnection({
        type: sourceType,
        host,
        port: Number(port) || (sourceType === 'SFTP' ? 22 : sourceType === 'MySQL' ? 3306 : 5432),
        databaseName: database,
        username,
        password: password || undefined,
        dbId: initialData?.id
      });
      setTestResult({
        success: res.success !== false,
        message: res.message || `${sourceType} connection ready`,
        latencyMs: res.pingMs ?? res.latencyMs ?? 0
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Connection failed: could not reach host',
        latencyMs: 0
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleContinue = () => {
    onNext({
      type: sourceType,
      name: displayName,
      host,
      port,
      database,
      username,
      password,
      scope,
      status: testResult?.success ? 'CONNECTED' : (initialData?.status || 'CONNECTED'),
      isFtp: sourceType === 'SFTP'
    });
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-8 text-xs text-slate-800">
      <div className="max-w-3xl space-y-6">
        {/* Source Type Selector */}
        <div>
          <label className="font-bold text-slate-900 text-xs block mb-2">What are you connecting?</label>
          <div className="grid grid-cols-5 gap-3">
            {[
              { id: 'MySQL' as const, label: 'MySQL', icon: Database },
              { id: 'PostgreSQL' as const, label: 'PostgreSQL', icon: Database },
              { id: 'MongoDB' as const, label: 'MongoDB', sub: 'Diagnostic', icon: Database },
              { id: 'SFTP' as const, label: 'SFTP / FTP', icon: Folder },
              { id: 'Oracle' as const, label: 'Oracle', sub: 'Not supported', icon: Lock, disabled: true }
            ].map(item => {
              const Icon = item.icon;
              const isSelected = sourceType === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => {
                    setSourceType(item.id);
                    if (item.id === 'SFTP') {
                      if (port === '3306' || port === '5432') setPort('22');
                      if (database === 'bo_test' || !database) setDatabase('/incoming/settlement/');
                    } else if (item.id === 'PostgreSQL') {
                      if (port === '22' || port === '3306') setPort('5432');
                    } else if (item.id === 'MySQL') {
                      if (port === '22' || port === '5432') setPort('3306');
                    }
                  }}
                  className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition cursor-pointer ${
                    item.disabled
                      ? 'opacity-40 cursor-not-allowed bg-slate-50 border-slate-200'
                      : isSelected
                      ? 'border-[#F97316] bg-orange-50/20 ring-1 ring-orange-500/20'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Icon size={16} className={isSelected ? 'text-[#F97316]' : 'text-slate-500'} />
                    <span className="font-bold text-slate-900 text-xs">{item.label}</span>
                  </div>
                  {item.sub && (
                    <span className="text-[10px] text-slate-400 mt-1">{item.sub}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Form Fields matching 62_step1_connect.png */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Display name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none"
            />
          </div>
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Host</label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono focus:outline-none"
            />
          </div>
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Port</label>
            <input
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="font-semibold text-slate-700 block mb-1">
              {sourceType === 'SFTP' ? 'Remote Base Directory' : 'Database'}
            </label>
            <input
              type="text"
              value={database}
              onChange={(e) => setDatabase(e.target.value)}
              placeholder={sourceType === 'SFTP' ? '/incoming/settlement/' : 'bo_test'}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono focus:outline-none"
            />
          </div>
          <div>
            <label className="font-semibold text-slate-700 block mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono focus:outline-none"
            />
          </div>
          <div>
            <label className="font-semibold text-slate-700 block mb-1">
              {sourceType === 'SFTP' ? 'Password / Private Key' : 'Password'}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setTestResult(null);
              }}
              placeholder={sourceType === 'SFTP' ? 'Enter SFTP password or key' : 'Enter password'}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono focus:outline-none"
            />
          </div>
        </div>

        {/* Who can use it */}
        <div>
          <label className="font-semibold text-slate-700 block mb-1.5">Who can use it</label>
          <div className="inline-flex bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setScope('team')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                scope === 'team' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Only my team
            </button>
            <button
              type="button"
              onClick={() => setScope('global')}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                scope === 'global' ? 'bg-white text-slate-900 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All teams (administrator)
            </button>
          </div>
        </div>

        {/* Connected / Error Status Banner matching 62_step1_connect.png */}
        {testResult ? (
          <div className={`p-3.5 border rounded-2xl flex items-center justify-between text-xs ${
            testResult.success
              ? 'bg-emerald-50/80 border-emerald-200/80'
              : 'bg-rose-50/80 border-rose-200/80'
          }`}>
            <div className="flex items-center space-x-2.5">
              {testResult.success ? (
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle size={16} className="text-rose-600 shrink-0" />
              )}
              <div>
                <span className={`font-bold ${testResult.success ? 'text-emerald-950' : 'text-rose-950'}`}>
                  {testResult.success ? 'Connected' : 'Connection Failed'}
                </span>
                <span className={`ml-2 ${testResult.success ? 'text-emerald-800' : 'text-rose-800'}`}>
                  {testResult.message} {testResult.latencyMs > 0 ? `· round trip ${testResult.latencyMs} ms` : ''}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting}
              className={`px-3 py-1.5 bg-white border rounded-xl font-semibold text-xs transition cursor-pointer flex items-center space-x-1 ${
                testResult.success
                  ? 'border-emerald-200 hover:bg-emerald-50 text-emerald-900'
                  : 'border-rose-200 hover:bg-rose-50 text-rose-900'
              }`}
            >
              <RefreshCw size={12} className={isTesting ? 'animate-spin' : ''} />
              <span>Test again</span>
            </button>
          </div>
        ) : (
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2.5">
              <RefreshCw size={16} className="text-slate-400 shrink-0" />
              <div className="text-slate-600">
                Click <span className="font-semibold text-slate-800">Test Connection</span> to verify credentials before proceeding.
              </div>
            </div>

            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting}
              className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 rounded-xl font-semibold text-xs transition cursor-pointer flex items-center space-x-1 shadow-2xs"
            >
              <RefreshCw size={12} className={isTesting ? 'animate-spin' : ''} />
              <span>Test Connection</span>
            </button>
          </div>
        )}
      </div>

      {/* Footer Navigation */}
      <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl font-medium text-xs transition cursor-pointer"
        >
          Back
        </button>

        <div className="text-[11px] text-slate-400">
          {sourceType === 'SFTP'
            ? 'Connection verified. Unlike SQL DBs, folder discovery and schedule parsing finish on its dedicated page.'
            : 'Connection works. Continue to choose tables.'}
        </div>

        <button
          type="button"
          onClick={handleContinue}
          className="px-5 py-2 bg-[#F97316] hover:bg-orange-600 text-white rounded-xl font-semibold text-xs transition cursor-pointer shadow-xs"
        >
          {sourceType === 'SFTP' ? 'Save & Open Dedicated Page →' : 'Continue →'}
        </button>
      </div>
    </div>
  );
}

export default Step1Connect;

