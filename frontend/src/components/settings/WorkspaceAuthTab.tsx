/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User } from '../../types';
import { WorkspaceConfig } from '../WorkspaceSettings';
import { api } from '../../api/client';
import {
  Shield, ShieldCheck, Mail, CheckCircle2, AlertTriangle,
  RefreshCw, Lock, Key, Globe, ExternalLink, Info
} from 'lucide-react';

interface WorkspaceAuthTabProps {
  currentUser: User;
  config: WorkspaceConfig;
  onChange: (updates: Partial<WorkspaceConfig>) => void;
  onSave?: () => void;
}

export const WorkspaceAuthTab: React.FC<WorkspaceAuthTabProps> = ({
  currentUser,
  config,
  onChange,
  onSave
}) => {
  const [availableAdminOAuth2, setAvailableAdminOAuth2] = useState<any[]>([]);
  const [isLoadingConnections, setIsLoadingConnections] = useState(false);
  const [selectedAdminOAuth2Id, setSelectedAdminOAuth2Id] = useState<string>(
    config.adminOAuth2ConnectionId || ''
  );
  const [userEmail, setUserEmail] = useState<string>(
    config.operationalEmail || currentUser.email || ''
  );
  const [channel, setChannel] = useState<'email' | 'teams'>(
    config.authChannel || 'email'
  );
  const [isTestingOAuth, setIsTestingOAuth] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load available Admin-configured OAuth 2.0 connections
  useEffect(() => {
    let isMounted = true;
    setIsLoadingConnections(true);
    api.getAvailableAdminOAuth2Connections()
      .then(res => {
        if (!isMounted) return;
        const activeConns = Array.isArray(res) ? res : [];
        setAvailableAdminOAuth2(activeConns);
        if (!selectedAdminOAuth2Id && activeConns.length > 0) {
          setSelectedAdminOAuth2Id(activeConns[0].id);
          onChange({ adminOAuth2ConnectionId: activeConns[0].id });
        }
      })
      .catch(err => {
        console.warn('Failed to load admin OAuth2 connections:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingConnections(false);
      });
    return () => { isMounted = false; };
  }, []);

  const selectedConn = availableAdminOAuth2.find(c => c.id === selectedAdminOAuth2Id);

  const handleTestAuthentication = async () => {
    if (!selectedAdminOAuth2Id) {
      setTestResult({
        success: false,
        message: 'Please select an Admin-configured OAuth 2.0 corporate connection.'
      });
      return;
    }
    if (!userEmail.trim()) {
      setTestResult({
        success: false,
        message: 'Operational or mailbox email address is required.'
      });
      return;
    }

    setIsTestingOAuth(true);
    setTestResult(null);

    try {
      const res = await api.testOAuth2Credentials(
        {
          adminOAuth2ConnectionId: selectedAdminOAuth2Id,
          userEmail: userEmail.trim()
        },
        channel
      );
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'OAuth 2.0 Modern Authentication verification failed.'
      });
    } finally {
      setIsTestingOAuth(false);
    }
  };

  const handleSaveAuthSettings = () => {
    onChange({
      adminOAuth2ConnectionId: selectedAdminOAuth2Id,
      operationalEmail: userEmail.trim(),
      authChannel: channel
    });
    setSaveSuccess(true);
    if (onSave) onSave();
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="space-y-4 font-sans" id="workspace-auth-tab">
      {/* 1. Header Overview Card */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex items-center space-x-3 border-b border-slate-100 pb-3">
          <div className="p-2 bg-blue-50 text-[#155DFC] rounded-xl border border-blue-200/70">
            <ShieldCheck size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 font-mono">Modern Authentication &amp; Mailbox Ingestion</h3>
            <p className="text-xs text-slate-500">
              Enterprise OAuth 2.0 credentials are segregated and managed centrally by IT Admins. Workspace operators authenticate with their email address only.
            </p>
          </div>
        </div>

        {/* Security Segregation Notice */}
        <div className="p-3.5 bg-blue-50/60 border border-blue-200/70 rounded-xl flex items-start space-x-3 text-xs text-blue-900">
          <Shield size={16} className="text-[#155DFC] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold font-mono">Enterprise Credential Segregation (Rule #14)</div>
            <p className="text-[11px] text-blue-800 leading-relaxed">
              Client IDs, Client Secrets, Tenant IDs, and API Scopes are strictly protected at the Administrator level. Workspace users never handle or expose corporate credentials. Simply bind your mailbox email address and test modern authentication connectivity.
            </p>
          </div>
        </div>
      </div>

      {/* 2. Connection Selection & Email Input */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
        <h4 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider">
          Active Corporate Connection &amp; Mailbox Binding
        </h4>

        {isLoadingConnections ? (
          <div className="py-6 flex items-center justify-center space-x-2 text-xs text-slate-500 font-mono">
            <RefreshCw size={14} className="animate-spin text-[#155DFC]" />
            <span>Discovering Admin OAuth 2.0 connections...</span>
          </div>
        ) : availableAdminOAuth2.length === 0 ? (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1.5">
            <div className="font-bold flex items-center space-x-1.5">
              <AlertTriangle size={15} className="text-amber-600" />
              <span>No Admin OAuth 2.0 Connections Configured</span>
            </div>
            <p className="text-[11px] text-amber-700 leading-relaxed">
              A Global Administrator must first register enterprise OAuth 2.0 app credentials (such as Microsoft 365, Google Workspace, or Zoho) in <strong>Admin Hub &gt; OAuth 2.0 &amp; Messaging</strong> before mailboxes can be authenticated.
            </p>
          </div>
        ) : (
          <div className="space-y-4 max-w-2xl">
            {/* Connection Selector */}
            <div>
              <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
                Select Admin OAuth 2.0 Connection *
              </label>
              <select
                value={selectedAdminOAuth2Id}
                onChange={(e) => {
                  setSelectedAdminOAuth2Id(e.target.value);
                  onChange({ adminOAuth2ConnectionId: e.target.value });
                  setTestResult(null);
                }}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs font-sans text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#155DFC] focus:bg-white transition-all shadow-2xs font-semibold"
              >
                {availableAdminOAuth2.map((conn) => (
                  <option key={conn.id} value={conn.id}>
                    {conn.displayName} — {conn.providerPreset} ({conn.channel?.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            {/* Selected Connection Metadata Snapshot */}
            {selectedConn && (
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5 font-mono">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-bold text-slate-800 flex items-center space-x-1.5">
                    <Lock size={12} className="text-blue-600" />
                    <span>Provider Preset:</span>
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-bold">
                      {selectedConn.providerPreset}
                    </span>
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Grant: {selectedConn.grantType}
                  </span>
                </div>
                {selectedConn.tenantId && (
                  <div className="text-[11px] text-slate-600">
                    Tenant ID: <code className="bg-slate-200/70 px-1 py-0.5 rounded text-[10px]">{selectedConn.tenantId}</code>
                  </div>
                )}
                {selectedConn.scope && (
                  <div className="text-[10px] text-slate-500 truncate" title={selectedConn.scope}>
                    Scopes: {selectedConn.scope}
                  </div>
                )}
              </div>
            )}

            {/* Channel Selection */}
            <div>
              <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1">
                Target Ingestion Channel
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { id: 'email' as const, label: 'Email / IMAP (OAuth2)', desc: 'Reconciliation reports & feeds' },
                  { id: 'teams' as const, label: 'Microsoft Teams (Graph)', desc: 'Bot notifications & triage' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setChannel(item.id);
                      onChange({ authChannel: item.id });
                      setTestResult(null);
                    }}
                    className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                      channel === item.id
                        ? 'bg-blue-50/80 border-[#155DFC] ring-1 ring-[#155DFC] text-blue-900'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-xs font-bold font-mono">{item.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Operational Email Address Input */}
            <div>
              <label className="block text-xs font-mono font-bold text-slate-700 uppercase mb-1 flex items-center justify-between">
                <span>Operational / Mailbox Email Address *</span>
                <span className="text-[10px] text-slate-500 font-sans font-normal">e.g. your corporate user email or shared ops mailbox</span>
              </label>
              <div className="relative">
                <input
                  type="email"
                  value={userEmail}
                  onChange={(e) => {
                    setUserEmail(e.target.value);
                    onChange({ operationalEmail: e.target.value });
                    setTestResult(null);
                  }}
                  placeholder="settlement-ops@corp.bank.com"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-3.5 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#155DFC] focus:bg-white transition-all shadow-2xs"
                />
                <Mail size={15} className="absolute left-3 top-2.5 text-slate-400" />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                This email identity is authenticated against the Admin OAuth 2.0 app credentials using SASL XOAUTH2 modern authentication.
              </p>
            </div>

            {/* Action Bar: Test Connection & Save Profile */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={isTestingOAuth || !selectedAdminOAuth2Id || !userEmail.trim()}
                onClick={handleTestAuthentication}
                className="px-4 py-2 bg-[#155DFC] hover:bg-blue-700 text-white rounded-xl text-xs font-mono font-bold transition flex items-center space-x-2 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTestingOAuth ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <ShieldCheck size={14} />
                )}
                <span>{isTestingOAuth ? 'Testing Authentication...' : 'Test & Authenticate Mailbox'}</span>
              </button>

              <button
                type="button"
                onClick={handleSaveAuthSettings}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-mono font-bold transition flex items-center space-x-2 cursor-pointer border border-slate-200"
              >
                <span>Save Authentication Profile</span>
              </button>

              {saveSuccess && (
                <span className="text-xs font-mono font-semibold text-emerald-700 flex items-center space-x-1">
                  <CheckCircle2 size={14} />
                  <span>Preferences saved.</span>
                </span>
              )}
            </div>

            {/* Test Authentication Result Feedback Card */}
            {testResult && (
              <div
                className={`p-4 rounded-xl border text-xs font-mono space-y-2 transition-all ${
                  testResult.success
                    ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50/80 border-rose-200 text-rose-900'
                }`}
              >
                <div className="flex items-center space-x-2 font-bold">
                  {testResult.success ? (
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                  )}
                  <span>{testResult.message}</span>
                </div>

                {testResult.details && (
                  <div className="pt-2 border-t border-emerald-200/60 text-[11px] space-y-1 font-mono text-emerald-800">
                    {testResult.details.tokenEndpoint && (
                      <div>Token Endpoint: <code>{testResult.details.tokenEndpoint}</code></div>
                    )}
                    {testResult.details.scope && (
                      <div className="truncate">Scopes: <code>{testResult.details.scope}</code></div>
                    )}
                    {testResult.details.expiresIn && (
                      <div>Access Token Duration: {Math.round(testResult.details.expiresIn / 60)} minutes</div>
                    )}
                    {testResult.details.tokenExpiryDate && (
                      <div>Valid Until: {new Date(testResult.details.tokenExpiryDate).toLocaleString()}</div>
                    )}
                    {testResult.details.tokenPrefix && (
                      <div>Bearer Token: <code>{testResult.details.tokenPrefix}</code></div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
