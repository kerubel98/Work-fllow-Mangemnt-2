/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense } from 'react';
import { User, DatabaseConnection, Team } from '../types';
import { 
  Settings, Sliders, Bell, Clock, 
  Save, 
  FileSpreadsheet, Volume2, 
  ArrowLeft, CheckCircle2, AlertTriangle, ShieldCheck,
  Boxes, GitFork, AlertCircle,
  Database, GitBranch, Layout, ChevronRight,
  Home, Users, Rocket, Share2
} from 'lucide-react';
import ErrorBoundary from './ErrorBoundary';
import { lazyWithRetry } from '../utils/lazyWithRetry';
import { api } from '../api/client';

import { WorkspaceGeneralTab } from './settings/WorkspaceGeneralTab';
import { WorkspaceWorkflowTab } from './settings/WorkspaceWorkflowTab';
import { WorkspaceNotificationsTab } from './settings/WorkspaceNotificationsTab';
import { WorkspaceDataTab } from './settings/WorkspaceDataTab';
import { WorkspaceAuthTab } from './settings/WorkspaceAuthTab';

const DatabaseColumnConfigurationStudio = lazyWithRetry(() => import('./settings/DatabaseColumnConfiguration'), 'DatabaseColumnConfiguration');
const ValidationBoxManager = lazyWithRetry(() => import('./settings/ValidationBoxManager').then(m => ({ default: m.ValidationBoxManager })), 'ValidationBoxManager');
const WorkflowStudioFlowchart = lazyWithRetry(() => import('./settings/WorkflowStudioFlowchart').then(m => ({ default: m.WorkflowStudioFlowchart })), 'WorkflowStudioFlowchart');

function StudioLoadingFallback() {
  return (
    <div className="w-full h-80 flex flex-col items-center justify-center gap-3 p-8 bg-white rounded-2xl border border-slate-200">
      <div className="w-8 h-8 border-3 border-[#155DFC] border-t-transparent rounded-full animate-spin" />
      <span className="text-xs font-semibold font-mono text-slate-500">Loading Configuration Studio...</span>
    </div>
  );
}

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
  adminOAuth2ConnectionId?: string;
  operationalEmail?: string;
  authChannel?: 'email' | 'teams';
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
  maskSensitiveCardNumbers: true,
  adminOAuth2ConnectionId: '',
  operationalEmail: '',
  authChannel: 'email'
};

const STORAGE_KEY = 'operational_workspace_config_v1';

export type SettingsTab = 
  | 'general' 
  | 'workflow' 
  | 'notifications' 
  | 'data' 
  | 'auth'
  | 'db_config' 
  | 'validation_box' 
  | 'workflow_studio';

interface WorkspaceSettingsProps {
  currentUser: User;
  teams?: Team[];
  databases?: DatabaseConnection[];
  onNavigateToWorkspace?: () => void;
  onNavigateToAuthorityCenter?: () => void;
  selectedWorkflowId?: string;
}

export default function WorkspaceSettings({
  currentUser,
  teams = [],
  databases = [],
  onNavigateToWorkspace,
  onNavigateToAuthorityCenter,
  selectedWorkflowId
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

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [feedbackBanner, setFeedbackBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  // Hydrate workspace settings authoritatively from approved PostgreSQL proposals (Rule 7 & Rule 23)
  useEffect(() => {
    let isMounted = true;
    api.getWorkspaceSettingProposals(currentUser.teamId, 'APPROVED')
      .then(proposals => {
        if (!isMounted || !Array.isArray(proposals)) return;
        const matching = proposals.find(p => p.settingKey === STORAGE_KEY);
        if (matching && matching.proposedChanges) {
          setConfig(prev => ({ ...prev, ...matching.proposedChanges }));
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_WORKSPACE_CONFIG, ...matching.proposedChanges }));
          } catch {}
        }
      })
      .catch(err => {
        console.warn('[WorkspaceSettings] Could not fetch approved setting proposals from PostgreSQL:', err);
      });

    return () => { isMounted = false; };
  }, [currentUser.teamId]);

  const handleSaveDraft = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      setFeedbackBanner({ type: 'success', text: 'Workspace preferences saved as offline draft.' });
      setTimeout(() => setFeedbackBanner(null), 3000);
    } catch (err) {
      console.warn('Could not save workspace draft:', err);
    }
  };

  const handleApplyChanges = async () => {
    setIsApplying(true);
    try {
      // 1. Optimistic local cache update
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));

      // 2. Persist proposal to PostgreSQL backend (Rule 7 & Rule 23)
      const userTeam = teams.find(t => t.id === currentUser.teamId) || teams[0];
      await api.submitWorkspaceSettingProposal({
        settingType: 'WORKSPACE_CONFIG',
        settingKey: STORAGE_KEY,
        title: `Workspace Configuration Update (${config.environmentMode})`,
        proposedChanges: config,
        currentSnapshot: DEFAULT_WORKSPACE_CONFIG,
        justification: `Configuration updated by ${currentUser.name} (${currentUser.role})`,
        makerId: currentUser.id,
        makerName: currentUser.name,
        teamId: currentUser.teamId || userTeam?.id || 'GLOBAL'
      });

      setFeedbackBanner({ 
        type: 'success', 
        text: 'Workspace configuration submitted for governance review & applied to active session.' 
      });
      setTimeout(() => setFeedbackBanner(null), 4000);
    } catch (err: any) {
      console.warn('Could not submit workspace proposal:', err);
      setFeedbackBanner({ 
        type: 'success', 
        text: `Workspace configuration saved locally (${err.message || 'offline buffer active'}).` 
      });
      setTimeout(() => setFeedbackBanner(null), 4000);
    } finally {
      setIsApplying(false);
    }
  };

  const envBadgeStyles = {
    Production: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Staging: 'bg-blue-50 text-[#155DFC] border-blue-200',
    Sandbox: 'bg-amber-50 text-amber-700 border-amber-200',
  }[config.environmentMode];

  const isDedicatedScreen = activeTab === 'db_config' || activeTab === 'validation_box' || activeTab === 'workflow_studio';

  return (
    <div 
      className={`flex flex-col ${isDedicatedScreen ? 'w-full h-[calc(100vh-2.25rem)] min-h-0 overflow-hidden' : 'max-w-7xl mx-auto space-y-4'}`} 
      id="workspace-settings-container"
    >
      {/* 1. Header with Title and Environment Badge */}
      <header className={`${isDedicatedScreen ? 'bg-[#0b1a22] border-[#163848] text-white shrink-0 mb-2' : 'bg-white border-slate-200/90 text-slate-800'} border rounded-2xl px-5 py-3 shadow-xs flex items-center justify-between gap-3`} id="workspace-settings-header">
        <div className="flex items-center space-x-3">
          {isDedicatedScreen ? (
            <button
              type="button"
              onClick={() => {
                if (onNavigateToWorkspace) onNavigateToWorkspace();
                else if (activeTab === 'workflow_studio') setActiveTab('workflow');
                else setActiveTab('general');
              }}
              className="p-2.5 bg-[#0e212b] hover:bg-[#122834] text-purple-400 hover:text-purple-300 rounded-xl transition cursor-pointer border border-[#1b4353] hover:border-purple-400/50 shrink-0"
              title="Home / Back"
            >
              <Home size={18} />
            </button>
          ) : (
            <div className="p-2.5 bg-blue-50 text-[#155DFC] rounded-xl border border-blue-200/60 shrink-0">
              <Settings size={20} />
            </div>
          )}
          <div>
            <div className="flex items-center space-x-2">
              <h1 className={`text-base font-bold tracking-tight ${isDedicatedScreen ? 'text-white' : 'text-slate-900 font-mono'}`}>
                Workspace Settings
              </h1>
              <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold border ${
                isDedicatedScreen
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-400'
                  : envBadgeStyles
              }`}>
                {config.environmentMode}
              </span>
            </div>
            <p className={`text-xs ${isDedicatedScreen ? 'text-slate-400' : 'text-slate-500'} hidden sm:block`}>
              Workspaces, Settlements, SLA governances, and rule engineering.
            </p>
          </div>
        </div>

        {!isDedicatedScreen && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSaveDraft}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 cursor-pointer border border-slate-200"
            >
              <Save size={14} />
              <span>Save Draft</span>
            </button>
            <button
              type="button"
              disabled={isApplying}
              onClick={handleApplyChanges}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              {isApplying ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <ShieldCheck size={14} />
              )}
              <span>{isApplying ? 'Submitting...' : 'Apply & Propose'}</span>
            </button>
          </div>
        )}
      </header>

      {/* Global Feedback Banner */}
      {feedbackBanner && (
        <div className={`p-3 rounded-xl border text-xs font-mono font-medium flex items-center space-x-2 shrink-0 mb-2 ${
          feedbackBanner.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {feedbackBanner.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{feedbackBanner.text}</span>
        </div>
      )}

      {/* 2. Main Content vs Dedicated Screen Switch */}
      {isDedicatedScreen ? (
        <div className={`flex-1 min-h-0 rounded-2xl border shadow-xs overflow-hidden flex flex-col ${activeTab === 'workflow_studio' ? 'bg-[#071318] border-[#163848]' : 'bg-white border-slate-200/90'}`} id="dedicated-screen-container">
          <div className={`h-full flex flex-col min-h-0 ${activeTab === 'workflow_studio' ? 'p-0' : 'p-1.5 sm:p-2.5 overflow-auto'}`}>
            {activeTab === 'db_config' && (
              <ErrorBoundary fallbackTitle="Column Configuration Error" fallbackMessage="Could not render Database Column Configuration Studio. You can retry or refresh.">
                <Suspense fallback={<StudioLoadingFallback />}>
                  <DatabaseColumnConfigurationStudio
                    currentUser={currentUser}
                    teams={teams}
                    databases={databases}
                  />
                </Suspense>
              </ErrorBoundary>
            )}

            {activeTab === 'validation_box' && (
              <ErrorBoundary fallbackTitle="Validation Box Error" fallbackMessage="Could not render Validation Box interface.">
                <Suspense fallback={<StudioLoadingFallback />}>
                  <ValidationBoxManager currentUser={currentUser} />
                </Suspense>
              </ErrorBoundary>
            )}

            {activeTab === 'workflow_studio' && (
              <ErrorBoundary fallbackTitle="Workflow Studio Error" fallbackMessage="Could not render Workflow Studio Flowchart.">
                <Suspense fallback={<StudioLoadingFallback />}>
                  <WorkflowStudioFlowchart
                    currentUser={currentUser}
                    selectedWorkflowId={selectedWorkflowId}
                  />
                </Suspense>
              </ErrorBoundary>
            )}
          </div>
        </div>
      ) : (
        /* Standard Settings: Slim Left Sidebar + Tiled Main Content */
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
          {/* A. Slim Left Sidebar Navigation */}
          <nav className="md:col-span-3 bg-white border border-slate-200/90 rounded-2xl p-3 shadow-xs space-y-4" aria-label="Settings navigation">
            <div className="space-y-1">
              <div className="px-3 py-1.5 text-[10px] font-mono font-bold text-slate-600 uppercase tracking-wider">
                Settings
              </div>

              {[
                { id: 'general' as const, label: 'General', icon: Sliders, desc: 'Identity & Environment' },
                { id: 'workflow' as const, label: 'Workflow', icon: Clock, desc: 'Rules & SLA targets' },
                { id: 'auth' as const, label: 'Auth & Ingestion', icon: ShieldCheck, desc: 'OAuth 2.0 & Mailbox' },
                { id: 'notifications' as const, label: 'Notifications', icon: Bell, desc: 'Alerts & Chimes' },
                { id: 'data' as const, label: 'Data', icon: Database, desc: 'Page size & Exports' },
              ].map(item => {
                const Icon = item.icon;
                const isSelected = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition cursor-pointer text-left ${
                      isSelected
                        ? 'bg-blue-50/80 text-[#155DFC] font-bold border border-blue-200/70 shadow-2xs'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <Icon size={16} className={isSelected ? 'text-[#155DFC]' : 'text-slate-600'} />
                      <div>
                        <div className="font-mono font-bold leading-tight">{item.label}</div>
                        <div className="text-[10px] text-slate-600 font-sans">{item.desc}</div>
                      </div>
                    </div>
                    {typeof (item as any).count === 'number' && (item as any).count > 0 && (
                      <span className="px-2 py-0.5 bg-amber-500 text-white font-mono font-bold text-[10px] rounded-full shadow-2xs">
                        {(item as any).count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Sub-Menu: Dedicated Advanced Screens */}
            <div className="pt-2 border-t border-slate-100 space-y-1">
              <div className="px-3 py-1 text-[10px] font-mono font-bold text-slate-600 uppercase tracking-wider">
                Advanced Tools
              </div>

              {[
                { id: 'workflow_studio' as const, label: 'Workflow Studio', icon: GitFork, badge: 'DAG' },
                { id: 'validation_box' as const, label: 'Validation Box', icon: Boxes, badge: 'Rules' },
                { id: 'db_config' as const, label: 'DB Mirror Config', icon: Database, badge: 'Schema' },
              ].map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-slate-700 hover:text-[#155DFC] hover:bg-slate-50 transition cursor-pointer border border-transparent"
                  >
                    <div className="flex items-center space-x-2">
                      <Icon size={15} className="text-slate-600" />
                      <span className="font-mono font-bold">{item.label}</span>
                    </div>
                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-bold border border-slate-200">
                      {item.badge}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>

          {/* B. Main Content Area */}
          <main className="md:col-span-9 space-y-4">
            {activeTab === 'general' && (
              <WorkspaceGeneralTab
                config={config}
                onChange={(updates) => setConfig(prev => ({ ...prev, ...updates }))}
              />
            )}

            {activeTab === 'workflow' && (
              <WorkspaceWorkflowTab
                config={config}
                onChange={(updates) => setConfig(prev => ({ ...prev, ...updates }))}
                onOpenWorkflowStudio={() => setActiveTab('workflow_studio')}
              />
            )}

            {activeTab === 'auth' && (
              <WorkspaceAuthTab
                currentUser={currentUser}
                config={config}
                onChange={(updates) => setConfig(prev => ({ ...prev, ...updates }))}
                onSave={handleApplyChanges}
              />
            )}

            {activeTab === 'notifications' && (
              <WorkspaceNotificationsTab
                config={config}
                onChange={(updates) => setConfig(prev => ({ ...prev, ...updates }))}
              />
            )}

            {activeTab === 'data' && (
              <WorkspaceDataTab
                config={config}
                onChange={(updates) => setConfig(prev => ({ ...prev, ...updates }))}
              />
            )}
          </main>
        </div>
      )}

    </div>
  );
}
