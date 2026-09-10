/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { User, DatabaseConnection } from '../types';
import { 
  Settings, Sliders, Bell, Clock, 
  Save, RotateCcw, 
  FileSpreadsheet, Volume2, 
  ArrowLeft, CheckCircle2, AlertTriangle, ShieldCheck,
  Boxes, GitFork
} from 'lucide-react';
import DatabaseValidationSettings from './settings/DatabaseValidationSettings';
import { ValidationBoxManager } from './settings/ValidationBoxManager';
import { WorkflowStudioFlowchart } from './settings/WorkflowStudioFlowchart';
import ErrorBoundary from './ErrorBoundary';

export interface WorkspaceConfig {
  workspaceName: string;
  environmentMode: 'Production' | 'Staging' | 'Sandbox';
  defaultLandingView: 'my_tasks' | 'workspace' | 'hashtags';
  autoAssignNewCases: boolean;
  requireHashtagForResolution: boolean;
  requireSandboxSimulation: boolean;
  autoReconcileOnScriptExecution: boolean;
  slaCriticalHours: number;
  slaHighHours: number;
  slaMediumHours: number;
  enableInAppToasts: boolean;
  enableAudioChimes: boolean;
  enableSlaBreachAlerts: boolean;
  defaultRowsPerPage: number;
  defaultExportFormat: 'xlsx' | 'csv' | 'json';
  maskSensitiveCardNumbers: boolean;
}

const DEFAULT_WORKSPACE_CONFIG: WorkspaceConfig = {
  workspaceName: 'Global Payment Operations Hub',
  environmentMode: 'Production',
  defaultLandingView: 'workspace',
  autoAssignNewCases: true,
  requireHashtagForResolution: true,
  requireSandboxSimulation: true,
  autoReconcileOnScriptExecution: true,
  slaCriticalHours: 1,
  slaHighHours: 4,
  slaMediumHours: 24,
  enableInAppToasts: true,
  enableAudioChimes: true,
  enableSlaBreachAlerts: true,
  defaultRowsPerPage: 50,
  defaultExportFormat: 'xlsx',
  maskSensitiveCardNumbers: true
};

const STORAGE_KEY = 'operational_workspace_config_v1';

interface WorkspaceSettingsProps {
  currentUser: User;
  databases?: DatabaseConnection[];
  onNavigateToWorkspace?: () => void;
}

export default function WorkspaceSettings({
  currentUser,
  databases = [],
  onNavigateToWorkspace
}: WorkspaceSettingsProps) {
  const [config, setConfig] = useState<WorkspaceConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...DEFAULT_WORKSPACE_CONFIG, ...JSON.parse(saved) };
    } catch {
      // Fallback
    }
    return DEFAULT_WORKSPACE_CONFIG;
  });

  const [activeTab, setActiveTab] = useState<'general' | 'validation_box' | 'workflow_studio' | 'workflow' | 'notifications' | 'data_grid' | 'database_validation'>('validation_box');
  const [saveBanner, setSaveBanner] = useState(false);

  const handleSave = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      setSaveBanner(true);
      setTimeout(() => setSaveBanner(false), 3000);
    } catch (err) {
      console.warn('Could not save workspace settings:', err);
    }
  };

  const handleResetDefaults = () => {
    if (confirm('Reset all workspace settings to system defaults?')) {
      setConfig(DEFAULT_WORKSPACE_CONFIG);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_WORKSPACE_CONFIG));
      setSaveBanner(true);
      setTimeout(() => setSaveBanner(false), 3000);
    }
  };

  const tabs = [
    { id: 'validation_box', label: 'Validation Box', icon: Boxes },
    { id: 'workflow_studio', label: 'Workflow Studio', icon: GitFork },
    { id: 'general', label: 'General', icon: Sliders },
    { id: 'database_validation', label: 'Database Rules', icon: ShieldCheck },
    { id: 'workflow', label: 'Workflow & SLA', icon: Clock },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'data_grid', label: 'Data & Export', icon: FileSpreadsheet }
  ] as const;

  return (
    <div className={`space-y-4 ${activeTab === 'workflow_studio' || activeTab === 'validation_box' ? 'w-full' : 'max-w-7xl mx-auto'}`}>
      {/* 1. Sleek Compact Header Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {onNavigateToWorkspace && (
            <button
              type="button"
              onClick={onNavigateToWorkspace}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition cursor-pointer border border-slate-700"
              title="Back to Workspace"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="p-1.5 bg-blue-600/20 text-blue-400 rounded-lg border border-blue-500/30">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">Workspace Settings</h1>
            <p className="text-[11px] text-slate-400">Manage environment preferences, operational rules, and validation workflows</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Changes</span>
          </button>
        </div>
      </div>

      {/* Save Success Banner */}
      {saveBanner && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex items-center gap-2 text-xs font-semibold shadow-2xs animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>Workspace preferences have been saved and applied.</span>
        </div>
      )}

      {/* 2. Modern Segmented Tab Bar (Full Width) */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-white text-slate-900 shadow-xs font-bold border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. Settings Content Pane */}
      {activeTab === 'validation_box' ? (
        <ErrorBoundary fallbackTitle="Validation Box Error" fallbackMessage="Could not render Validation Box interface.">
          <ValidationBoxManager currentUser={currentUser} />
        </ErrorBoundary>
      ) : activeTab === 'workflow_studio' ? (
        <ErrorBoundary fallbackTitle="Workflow Studio Error" fallbackMessage="Could not render Workflow Studio Flowchart.">
          <WorkflowStudioFlowchart currentUser={currentUser} />
        </ErrorBoundary>
      ) : activeTab === 'database_validation' ? (
        <ErrorBoundary fallbackTitle="Database Validation Settings Error" fallbackMessage="Could not render Database Validation rules. You can reset cached workflows or retry.">
          <DatabaseValidationSettings
            currentUser={currentUser}
            databases={databases}
          />
        </ErrorBoundary>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5">
          {/* TAB 1: GENERAL */}
          {activeTab === 'general' && (
            <div className="space-y-5 max-w-3xl">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900">General Configuration</h3>
                <p className="text-xs text-slate-500">Workspace name, runtime environment, and default landing views.</p>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Workspace Name
                  </label>
                  <input
                    type="text"
                    value={config.workspaceName}
                    onChange={(e) => setConfig({ ...config, workspaceName: e.target.value })}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium text-slate-900"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Active Environment Tag
                    </label>
                    <select
                      value={config.environmentMode}
                      onChange={(e) => setConfig({ ...config, environmentMode: e.target.value as any })}
                      className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                    >
                      <option value="Production">Production (Live Transaction Gateway)</option>
                      <option value="Staging">Staging (Pre-Release Validation)</option>
                      <option value="Sandbox">Sandbox (Test Simulation Node)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Default Landing View
                    </label>
                    <select
                      value={config.defaultLandingView}
                      onChange={(e) => setConfig({ ...config, defaultLandingView: e.target.value as any })}
                      className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium"
                    >
                      <option value="workspace">Investigation Workspace (Active Cases)</option>
                      <option value="my_tasks">My Assigned Tasks (Kanban View)</option>
                      <option value="hashtags">Hashtag Preset Library</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: WORKFLOW & SLA */}
          {activeTab === 'workflow' && (
            <div className="space-y-5 max-w-3xl">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900">Workflow Automation & SLA Policies</h3>
                <p className="text-xs text-slate-500">Case routing automation, resolution constraints, and SLA deadline targets.</p>
              </div>

              {/* Toggles */}
              <div className="space-y-2.5 divide-y divide-slate-100">
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Auto-Assign Incoming Cases</p>
                    <p className="text-[11px] text-slate-500">Automatically routes unassigned tickets to available technical operators</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.autoAssignNewCases}
                    onChange={(e) => setConfig({ ...config, autoAssignNewCases: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between pt-2.5">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Require Hashtag Preset on Resolution</p>
                    <p className="text-[11px] text-slate-500">Ensures cases match an approved resolution hashtag before closing</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.requireHashtagForResolution}
                    onChange={(e) => setConfig({ ...config, requireHashtagForResolution: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between pt-2.5">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Require Staging Sandbox Simulation</p>
                    <p className="text-[11px] text-slate-500">Scripts must pass simulation test before executing in production</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.requireSandboxSimulation}
                    onChange={(e) => setConfig({ ...config, requireSandboxSimulation: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between pt-2.5">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">Auto-Reconcile Working Records</p>
                    <p className="text-[11px] text-slate-500">Marks batch transaction records as resolved upon script execution</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.autoReconcileOnScriptExecution}
                    onChange={(e) => setConfig({ ...config, autoReconcileOnScriptExecution: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* SLA Targets */}
              <div className="pt-3 border-t border-slate-100">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                  SLA Target Resolution Deadlines
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-red-50/60 border border-red-200 rounded-lg">
                    <span className="text-[10px] font-bold text-red-700 uppercase">Critical Priority</span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        type="number"
                        min={1}
                        max={72}
                        value={config.slaCriticalHours}
                        onChange={(e) => setConfig({ ...config, slaCriticalHours: Number(e.target.value) })}
                        className="w-14 text-xs p-1 bg-white border border-red-300 rounded font-bold font-mono text-red-900"
                      />
                      <span className="text-xs text-red-800 font-medium">Hours</span>
                    </div>
                  </div>

                  <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg">
                    <span className="text-[10px] font-bold text-amber-700 uppercase">High Priority</span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        type="number"
                        min={1}
                        max={120}
                        value={config.slaHighHours}
                        onChange={(e) => setConfig({ ...config, slaHighHours: Number(e.target.value) })}
                        className="w-14 text-xs p-1 bg-white border border-amber-300 rounded font-bold font-mono text-amber-900"
                      />
                      <span className="text-xs text-amber-800 font-medium">Hours</span>
                    </div>
                  </div>

                  <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg">
                    <span className="text-[10px] font-bold text-blue-700 uppercase">Medium Priority</span>
                    <div className="flex items-center gap-1.5 mt-1">
                      <input
                        type="number"
                        min={1}
                        max={240}
                        value={config.slaMediumHours}
                        onChange={(e) => setConfig({ ...config, slaMediumHours: Number(e.target.value) })}
                        className="w-14 text-xs p-1 bg-white border border-blue-300 rounded font-bold font-mono text-blue-900"
                      />
                      <span className="text-xs text-blue-800 font-medium">Hours</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <div className="space-y-5 max-w-3xl">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900">Notifications & Sound Alerts</h3>
                <p className="text-xs text-slate-500">Configure in-app banners, sound alerts, and SLA escalation broadcasts.</p>
              </div>

              <div className="space-y-2.5 divide-y divide-slate-100">
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                      <Bell className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">In-App Live Toast Banners</p>
                      <p className="text-[11px] text-slate-500">Displays transient notification badges for case updates and team mentions</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.enableInAppToasts}
                    onChange={(e) => setConfig({ ...config, enableInAppToasts: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between pt-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-purple-50 text-purple-600 rounded-lg">
                      <Volume2 className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Sound Chime on Critical Events</p>
                      <p className="text-[11px] text-slate-500">Plays subtle audio alert when critical priority issues are received</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.enableAudioChimes}
                    onChange={(e) => setConfig({ ...config, enableAudioChimes: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between pt-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-red-50 text-red-600 rounded-lg">
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">SLA Breach Warning Alerts</p>
                      <p className="text-[11px] text-slate-500">Sends alert broadcast 30 minutes prior to SLA expiration</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.enableSlaBreachAlerts}
                    onChange={(e) => setConfig({ ...config, enableSlaBreachAlerts: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DATA GRID & EXPORT */}
          {activeTab === 'data_grid' && (
            <div className="space-y-5 max-w-3xl">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900">Data Grid & Export Preferences</h3>
                <p className="text-xs text-slate-500">Configure tabular record display limits, sensitive card masking, and export formats.</p>
              </div>

              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Default Records Per Page
                    </label>
                    <select
                      value={config.defaultRowsPerPage}
                      onChange={(e) => setConfig({ ...config, defaultRowsPerPage: Number(e.target.value) })}
                      className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                    >
                      <option value={25}>25 Rows</option>
                      <option value={50}>50 Rows (Recommended)</option>
                      <option value={100}>100 Rows</option>
                      <option value={200}>200 Rows</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Default Export Format
                    </label>
                    <select
                      value={config.defaultExportFormat}
                      onChange={(e) => setConfig({ ...config, defaultExportFormat: e.target.value as any })}
                      className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold"
                    >
                      <option value="xlsx">Excel Spreadsheet (.xlsx)</option>
                      <option value="csv">Comma Separated Values (.csv)</option>
                      <option value="json">Raw JSON Payload (.json)</option>
                    </select>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">PCI-DSS Card Number Masking</p>
                    <p className="text-[11px] text-slate-500">Automatically masks card numbers to format (•••• •••• •••• 1234)</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.maskSensitiveCardNumbers}
                    onChange={(e) => setConfig({ ...config, maskSensitiveCardNumbers: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
