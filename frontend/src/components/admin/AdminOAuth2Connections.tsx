/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Key, ShieldCheck, Plus, Trash2, Edit3, CheckCircle2, 
  AlertCircle, RefreshCw, Loader2, ExternalLink, Globe, 
  Mail, MessageSquare, Info, Check, X
} from 'lucide-react';
import { api } from '../../api/client';

export interface AdminOAuth2Connection {
  id: string;
  channel: string;
  displayName: string;
  status: string;
  config: {
    authType: 'OAUTH2';
    providerPreset?: 'MICROSOFT_365' | 'GOOGLE_WORKSPACE' | 'ZOHO' | 'CUSTOM';
    preset?: 'MICROSOFT_365' | 'GOOGLE_WORKSPACE' | 'ZOHO' | 'CUSTOM';
    zohoRegion?: 'COM' | 'EU' | 'IN' | 'AU' | 'JP' | 'CA';
    clientId: string;
    clientSecret?: string;
    hasSecret?: boolean;
    tenantId?: string;
    tokenUrl?: string;
    scope?: string;
    grantType?: 'client_credentials' | 'refresh_token' | 'authorization_code';
    isGlobal?: boolean;
  };
  lastFetchAt?: string;
  lastError?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export default function AdminOAuth2Connections() {
  const [connections, setConnections] = useState<AdminOAuth2Connection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [channel, setChannel] = useState<'email' | 'teams' | 'whatsapp' | 'telegram'>('email');
  const [providerPreset, setProviderPreset] = useState<'MICROSOFT_365' | 'GOOGLE_WORKSPACE' | 'ZOHO' | 'CUSTOM'>('MICROSOFT_365');
  const [zohoRegion, setZohoRegion] = useState<'COM' | 'EU' | 'IN' | 'AU' | 'JP' | 'CA'>('COM');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [tokenUrl, setTokenUrl] = useState('');
  const [scope, setScope] = useState('https://graph.microsoft.com/.default');
  const [grantType, setGrantType] = useState<'client_credentials' | 'refresh_token' | 'authorization_code'>('client_credentials');
  
  // Test State
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; details?: any } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Per-item test status
  const [testingItemId, setTestingItemId] = useState<string | null>(null);
  const [itemTestStatus, setItemTestStatus] = useState<Record<string, { success: boolean; message: string }>>({});

  const loadConnections = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await api.getAdminOAuth2Connections();
      setConnections(data || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load Admin OAuth2 connections.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConnections();
  }, []);

  const handlePresetChange = (preset: 'MICROSOFT_365' | 'GOOGLE_WORKSPACE' | 'ZOHO' | 'CUSTOM') => {
    setProviderPreset(preset);
    setTestResult(null);
    if (preset === 'MICROSOFT_365') {
      setScope('https://graph.microsoft.com/.default');
      setGrantType('client_credentials');
      setTokenUrl('');
    } else if (preset === 'GOOGLE_WORKSPACE') {
      setScope('https://mail.google.com/');
      setGrantType('refresh_token');
      setTokenUrl('https://oauth2.googleapis.com/token');
    } else if (preset === 'ZOHO') {
      setScope('ZohoMail.messages.ALL,ZohoMail.accounts.ALL');
      setGrantType('refresh_token');
      setTokenUrl('');
    } else {
      setScope('');
      setGrantType('client_credentials');
      setTokenUrl('');
    }
  };

  const openCreateModal = () => {
    setEditingId(null);
    setDisplayName('');
    setChannel('email');
    setProviderPreset('MICROSOFT_365');
    setZohoRegion('COM');
    setClientId('');
    setClientSecret('');
    setTenantId('');
    setTokenUrl('');
    setScope('https://graph.microsoft.com/.default');
    setGrantType('client_credentials');
    setTestResult(null);
    setShowModal(true);
  };

  const openEditModal = (conn: AdminOAuth2Connection) => {
    setEditingId(conn.id);
    setDisplayName(conn.displayName);
    setChannel((conn.channel as any) || 'email');
    const p = conn.config?.providerPreset || conn.config?.preset || 'MICROSOFT_365';
    setProviderPreset(p);
    setZohoRegion(conn.config?.zohoRegion || 'COM');
    setClientId(conn.config?.clientId || '');
    setClientSecret(conn.config?.clientSecret || (conn.config?.hasSecret ? '••••••••' : ''));
    setTenantId(conn.config?.tenantId || '');
    setTokenUrl(conn.config?.tokenUrl || '');
    setScope(conn.config?.scope || '');
    setGrantType(conn.config?.grantType || 'client_credentials');
    setTestResult(null);
    setShowModal(true);
  };

  const handleTestInModal = async () => {
    if (!clientId) {
      setTestResult({ success: false, message: 'Client ID is required for testing.' });
      return;
    }
    if (!clientSecret) {
      setTestResult({ success: false, message: 'Client Secret is required for testing.' });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.testOAuth2Credentials({
        authType: 'OAUTH2',
        providerPreset,
        zohoRegion,
        clientId,
        clientSecret,
        tenantId,
        tokenUrl,
        scope,
        grantType
      }, channel);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || 'OAuth2 verification failed.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestItem = async (conn: AdminOAuth2Connection) => {
    setTestingItemId(conn.id);
    try {
      const res = await api.testOAuth2Credentials({
        adminOAuth2ConnectionId: conn.id
      }, conn.channel);
      setItemTestStatus(prev => ({
        ...prev,
        [conn.id]: { success: res.success, message: res.message }
      }));
    } catch (err: any) {
      setItemTestStatus(prev => ({
        ...prev,
        [conn.id]: { success: false, message: err.message || 'Verification failed.' }
      }));
    } finally {
      setTestingItemId(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      alert('Display Name is required.');
      return;
    }
    if (!clientId.trim()) {
      alert('Client ID is required.');
      return;
    }
    if (!editingId && !clientSecret.trim()) {
      alert('Client Secret is required.');
      return;
    }

    setIsSaving(true);
    try {
      await api.saveAdminOAuth2Connection({
        id: editingId || undefined,
        displayName: displayName.trim(),
        channel,
        status: 'ACTIVE',
        config: {
          authType: 'OAUTH2',
          providerPreset,
          zohoRegion: providerPreset === 'ZOHO' ? zohoRegion : undefined,
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          tenantId: tenantId.trim() || undefined,
          tokenUrl: tokenUrl.trim() || undefined,
          scope: scope.trim() || undefined,
          grantType,
          isGlobal: true
        }
      });
      setShowModal(false);
      await loadConnections();
    } catch (err: any) {
      alert(`Save failed: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the Admin OAuth2 Connection "${name}"? Teams using this connection will lose modern authentication access.`)) {
      return;
    }
    try {
      await api.deleteAdminOAuth2Connection(id);
      await loadConnections();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Key size={20} />
            </span>
            <h2 className="text-base font-bold text-slate-900">Enterprise OAuth 2.0 Connections</h2>
            <span className="px-2 py-0.5 text-[11px] font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Global Admin
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
            Configure central modern authentication credentials (Microsoft 365 / Azure Entra ID, Google Workspace, Zoho Mail). 
            When defined here, back office teams only need to provide their mailbox email address without managing secrets or app registrations.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-sm self-start sm:self-auto cursor-pointer"
        >
          <Plus size={16} />
          <span>New OAuth2 Connection</span>
        </button>
      </div>

      {/* Info Callout */}
      <div className="flex items-start gap-3 p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-800">
        <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-semibold text-blue-900">How Teams Use Admin OAuth2 Connections:</p>
          <p className="text-blue-700 text-[11.5px] leading-relaxed">
            In <strong>My Team &gt; External Channels</strong>, operators can select any global connection from a dropdown. 
            The system handles token acquisition, refresh cycles, and SASL XOAUTH2 protocol internally—keeping sensitive Client Secrets safe.
          </p>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Connections List */}
      {isLoading ? (
        <div className="py-12 text-center text-slate-400 space-y-2">
          <Loader2 size={24} className="mx-auto animate-spin text-blue-600" />
          <p className="text-xs">Loading Admin OAuth2 connections...</p>
        </div>
      ) : connections.length === 0 ? (
        <div className="py-12 bg-white rounded-2xl border border-slate-200 text-center space-y-3 p-6">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Key size={24} />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-slate-800">No Global OAuth 2.0 Connections Configured</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Add a central Microsoft 365, Google Workspace, or Zoho connection so your operational teams can link their inboxes with zero credential friction.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-2 transition cursor-pointer"
          >
            <Plus size={15} />
            <span>Configure First Connection</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {connections.map((conn) => {
            const preset = conn.config?.providerPreset || conn.config?.preset || 'CUSTOM';
            const testStatus = itemTestStatus[conn.id];
            const isTestingThis = testingItemId === conn.id;

            return (
              <div 
                key={conn.id} 
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between space-y-4 hover:border-blue-300 transition"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">{conn.displayName}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase font-mono ${
                          preset === 'MICROSOFT_365' ? 'bg-sky-50 text-sky-700 border border-sky-200' :
                          preset === 'GOOGLE_WORKSPACE' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          preset === 'ZOHO' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          'bg-purple-50 text-purple-700 border border-purple-200'
                        }`}>
                          {preset.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono">
                        Channel: <span className="text-slate-800 font-semibold uppercase">{conn.channel}</span> • Grant: <span className="text-slate-800 font-semibold">{conn.config?.grantType || 'client_credentials'}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(conn)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                        title="Edit Connection"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button
                        onClick={() => handleDelete(conn.id, conn.displayName)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                        title="Delete Connection"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Credentials Overview */}
                  <div className="bg-slate-50/80 rounded-xl p-3 space-y-1.5 text-[11.5px] border border-slate-100 font-mono">
                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-400">Client / App ID:</span>
                      <span className="text-slate-800 font-semibold truncate max-w-[200px]" title={conn.config?.clientId}>
                        {conn.config?.clientId || 'N/A'}
                      </span>
                    </div>

                    {conn.config?.tenantId && (
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="text-slate-400">Tenant / Domain:</span>
                        <span className="text-slate-800 truncate max-w-[200px]" title={conn.config.tenantId}>
                          {conn.config.tenantId}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-slate-600">
                      <span className="text-slate-400">Client Secret:</span>
                      <span className="text-emerald-700 font-semibold">Configured (Encrypted)</span>
                    </div>

                    {conn.config?.scope && (
                      <div className="flex items-center justify-between text-slate-600 pt-1 border-t border-slate-200/50">
                        <span className="text-slate-400">Scope:</span>
                        <span className="text-slate-700 truncate max-w-[220px]" title={conn.config.scope}>
                          {conn.config.scope}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Inline Test Result Message */}
                  {testStatus && (
                    <div className={`p-2.5 rounded-lg text-xs flex items-start gap-2 ${
                      testStatus.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}>
                      {testStatus.success ? <CheckCircle2 size={15} className="text-emerald-600 shrink-0 mt-0.5" /> : <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />}
                      <span className="leading-snug">{testStatus.message}</span>
                    </div>
                  )}
                </div>

                {/* Footer Controls */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 font-medium">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Available to All Teams
                  </span>

                  <button
                    type="button"
                    onClick={() => handleTestItem(conn)}
                    disabled={isTestingThis}
                    className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    {isTestingThis ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    <span>Test OAuth2</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit OAuth2 Connection Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-blue-100 text-blue-600">
                  <Key size={18} />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {editingId ? 'Edit Admin OAuth 2.0 Connection' : 'New Admin OAuth 2.0 Connection'}
                  </h3>
                  <p className="text-[11px] text-slate-500">Global identity provider for all operational teams</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSave} className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Display Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Corporate Microsoft 365 Entra ID"
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Service Preset *</label>
                  <select
                    value={providerPreset}
                    onChange={e => handlePresetChange(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-medium"
                  >
                    <option value="MICROSOFT_365">Microsoft 365 (Azure Entra ID)</option>
                    <option value="GOOGLE_WORKSPACE">Google Workspace (Gmail)</option>
                    <option value="ZOHO">Zoho Mail</option>
                    <option value="CUSTOM">Custom OAuth 2.0 Provider</option>
                  </select>
                </div>
              </div>

              {providerPreset === 'ZOHO' && (
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Zoho Data Center Region</label>
                  <select
                    value={zohoRegion}
                    onChange={e => setZohoRegion(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-medium"
                  >
                    <option value="COM">Global (.com)</option>
                    <option value="EU">European Union (.eu)</option>
                    <option value="IN">India (.in)</option>
                    <option value="AU">Australia (.com.au)</option>
                    <option value="JP">Japan (.jp)</option>
                    <option value="CA">Canada (.ca)</option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Client ID (App ID) *</label>
                  <input
                    type="text"
                    required
                    placeholder="Application (client) ID"
                    value={clientId}
                    onChange={e => setClientId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">
                    Client Secret {editingId ? '(Leave blank to preserve)' : '*'}
                  </label>
                  <input
                    type="password"
                    required={!editingId}
                    placeholder={editingId ? '••••••••' : 'Client secret value'}
                    value={clientSecret}
                    onChange={e => setClientSecret(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">
                    {providerPreset === 'MICROSOFT_365' ? 'Directory (Tenant) ID' : 'Tenant ID / Domain (Optional)'}
                  </label>
                  <input
                    type="text"
                    placeholder={providerPreset === 'MICROSOFT_365' ? 'e.g. contoso.onmicrosoft.com or Tenant UUID' : 'Optional tenant identifier'}
                    value={tenantId}
                    onChange={e => setTenantId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Grant Type</label>
                  <select
                    value={grantType}
                    onChange={e => setGrantType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-medium"
                  >
                    <option value="client_credentials">Client Credentials (Application-level / Background Service)</option>
                    <option value="refresh_token">Refresh Token Grant (User delegated / Permanent Token)</option>
                    <option value="authorization_code">Authorization Code / Grant Token</option>
                  </select>
                </div>
              </div>

              {providerPreset === 'CUSTOM' && (
                <div className="space-y-1">
                  <label className="font-semibold text-slate-700">Token Endpoint URL *</label>
                  <input
                    type="url"
                    required
                    placeholder="https://oauth.your-provider.com/token"
                    value={tokenUrl}
                    onChange={e => setTokenUrl(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-mono"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="font-semibold text-slate-700">Scopes</label>
                <input
                  type="text"
                  placeholder="e.g. https://graph.microsoft.com/.default"
                  value={scope}
                  onChange={e => setScope(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none font-mono"
                />
                <p className="text-[10px] text-slate-400">
                  {providerPreset === 'MICROSOFT_365' 
                    ? 'Default: https://graph.microsoft.com/.default (or https://outlook.office.com/IMAP.AccessAsUser.All)' 
                    : providerPreset === 'ZOHO' 
                    ? 'Default: ZohoMail.messages.ALL,ZohoMail.accounts.ALL'
                    : 'Comma-separated or space-separated API permission scopes'}
                </p>
              </div>

              {/* Live Test Feedback Banner */}
              {testResult && (
                <div className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                  testResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                  {testResult.success ? <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" /> : <AlertCircle size={16} className="text-rose-600 shrink-0 mt-0.5" />}
                  <div className="space-y-1">
                    <p className="font-semibold">{testResult.message}</p>
                    {testResult.details && (
                      <div className="text-[11px] font-mono opacity-90 space-y-0.5">
                        <p>Endpoint: {testResult.details.tokenEndpoint}</p>
                        <p>Token validity: ~{Math.round(testResult.details.expiresIn / 60)} minutes</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleTestInModal}
                  disabled={isTesting || !clientId}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  {isTesting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  <span>Test Connection</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold rounded-xl transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSaving && <Loader2 size={14} className="animate-spin" />}
                    <span>{editingId ? 'Save Changes' : 'Create Connection'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
