/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense } from 'react';
import { User, DatabaseConnection, WorkspaceSettingProposal, SettingProposalType, SettingProposalStatus, TeamEscalationTarget, Team } from '../types';
import { 
  Settings, Sliders, Bell, Clock, 
  Save, RotateCcw, 
  FileSpreadsheet, Volume2, 
  ArrowLeft, CheckCircle2, AlertTriangle, ShieldCheck,
  Boxes, GitFork, FileCheck, Send, ArrowUpRight, XCircle, AlertCircle, X, ShieldAlert, Filter,
  Database, GitBranch, Layout, ChevronRight
} from 'lucide-react';
import { api } from '../api/client';
import ErrorBoundary from './ErrorBoundary';
import { lazyWithRetry } from '../utils/lazyWithRetry';

import { WorkspaceGeneralTab } from './settings/WorkspaceGeneralTab';
import { WorkspaceWorkflowTab } from './settings/WorkspaceWorkflowTab';
import { WorkspaceGovernanceTab } from './settings/WorkspaceGovernanceTab';
import { WorkspaceNotificationsTab } from './settings/WorkspaceNotificationsTab';
import { WorkspaceDataTab } from './settings/WorkspaceDataTab';

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

export type SettingsTab = 
  | 'general' 
  | 'workflow' 
  | 'governance' 
  | 'notifications' 
  | 'data' 
  | 'db_config' 
  | 'validation_box' 
  | 'workflow_studio';

interface WorkspaceSettingsProps {
  currentUser: User;
  teams?: Team[];
  databases?: DatabaseConnection[];
  onNavigateToWorkspace?: () => void;
  selectedWorkflowId?: string;
}

export default function WorkspaceSettings({
  currentUser,
  teams = [],
  databases = [],
  onNavigateToWorkspace,
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

  // Setting Proposals State
  const [proposals, setProposals] = useState<WorkspaceSettingProposal[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [proposalFilter, setProposalFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ESCALATED'>('ALL');
  const [proposalFeedbackMsg, setProposalFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Submit Proposal Modal State
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitSettingType, setSubmitSettingType] = useState<SettingProposalType>('WORKSPACE_CONFIG');
  const [submitSettingKey, setSubmitSettingKey] = useState('workspace_config');
  const [submitTitle, setSubmitTitle] = useState('');
  const [submitJustification, setSubmitJustification] = useState('');
  const [submitProposedJson, setSubmitProposedJson] = useState('');
  const [isSubmittingProposal, setIsSubmittingProposal] = useState(false);
  const [submitModalError, setSubmitModalError] = useState('');

  // Review State
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewSubmittingId, setReviewSubmittingId] = useState<string | null>(null);

  // Escalation Modal State
  const [escalatingProposal, setEscalatingProposal] = useState<WorkspaceSettingProposal | null>(null);
  const [escalationTargets, setEscalationTargets] = useState<TeamEscalationTarget[]>([]);
  const [selectedEscalationTargetId, setSelectedEscalationTargetId] = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [isEscalatingSubmitting, setIsEscalatingSubmitting] = useState(false);
  const [escalateModalError, setEscalateModalError] = useState('');

  const fetchProposals = async () => {
    setLoadingProposals(true);
    try {
      const userTeam = currentUser.teamId || 'team-cards';
      const res = await api.getWorkspaceSettingProposals({ teamId: userTeam });
      setProposals(Array.isArray(res) ? res : []);
    } catch (err: any) {
      console.error('Failed to load workspace setting proposals:', err);
    } finally {
      setLoadingProposals(false);
    }
  };

  useEffect(() => {
    fetchProposals();
  }, [currentUser.teamId]);

  const handleOpenSubmitProposal = () => {
    setSubmitSettingType('WORKSPACE_CONFIG');
    setSubmitSettingKey('workspace_config');
    setSubmitTitle(`Workspace Config Revision (${new Date().toLocaleDateString()})`);
    setSubmitJustification('');
    setSubmitProposedJson(JSON.stringify(config, null, 2));
    setSubmitModalError('');
    setShowSubmitModal(true);
  };

  const handleSubmitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitModalError('');
    if (!submitTitle.trim()) {
      setSubmitModalError('Title is required.');
      return;
    }
    if (!submitJustification.trim()) {
      setSubmitModalError('Justification is required for Maker-Checker auditing.');
      return;
    }
    let parsedChanges: any;
    try {
      parsedChanges = JSON.parse(submitProposedJson);
    } catch (err: any) {
      setSubmitModalError(`Invalid JSON in proposed changes: ${err.message}`);
      return;
    }

    setIsSubmittingProposal(true);
    try {
      const userTeam = currentUser.teamId || 'team-cards';
      await api.createWorkspaceSettingProposal({
        teamId: userTeam,
        settingType: submitSettingType,
        settingKey: submitSettingKey.trim() || 'workspace_config',
        title: submitTitle.trim(),
        justification: submitJustification.trim(),
        proposedChanges: parsedChanges,
        makerId: currentUser.id,
        makerName: currentUser.name
      });
      setShowSubmitModal(false);
      setProposalFeedbackMsg({ type: 'success', text: 'Setting proposal created successfully! Awaiting Checker review.' });
      setTimeout(() => setProposalFeedbackMsg(null), 4000);
      await fetchProposals();
      setActiveTab('governance');
    } catch (err: any) {
      setSubmitModalError(err.message || 'Failed to submit setting proposal.');
    } finally {
      setIsSubmittingProposal(false);
    }
  };

  const handleReviewProposal = async (proposal: WorkspaceSettingProposal, action: 'APPROVE' | 'REJECT') => {
    if (currentUser.id === proposal.makerId) {
      alert('Anti-Self-Approval Violation: As Maker of this proposal, you cannot approve or reject it. A separate Checker is required.');
      return;
    }
    const notes = reviewNotes[proposal.id] || '';
    setReviewSubmittingId(proposal.id);
    try {
      await api.reviewWorkspaceSettingProposal(
        proposal.id,
        action,
        currentUser.id,
        currentUser.name,
        notes
      );
      setProposalFeedbackMsg({
        type: 'success',
        text: `Proposal #${proposal.id.slice(0, 8)} has been ${action === 'APPROVE' ? 'APPROVED and applied' : 'REJECTED'}.`
      });
      setTimeout(() => setProposalFeedbackMsg(null), 4000);
      await fetchProposals();
      if (action === 'APPROVE' && proposal.settingKey === 'workspace_config' && proposal.proposedChanges) {
        setConfig(prev => ({ ...prev, ...proposal.proposedChanges }));
      }
    } catch (err: any) {
      setProposalFeedbackMsg({ type: 'error', text: err.message || 'Review action failed.' });
      setTimeout(() => setProposalFeedbackMsg(null), 4000);
    } finally {
      setReviewSubmittingId(null);
    }
  };

  const handleOpenEscalateModal = async (proposal: WorkspaceSettingProposal) => {
    setEscalatingProposal(proposal);
    setSelectedEscalationTargetId('');
    setEscalationReason('');
    setEscalateModalError('');
    setLoadingTargets(true);
    try {
      const userTeam = proposal.teamId || currentUser.teamId || 'team-cards';
      const matrix = await api.getTeamEscalationMatrix(userTeam);
      setEscalationTargets(matrix);
      if (matrix.length > 0) {
        setSelectedEscalationTargetId(matrix[0].target_team_id);
      }
    } catch (err: any) {
      setEscalateModalError('Failed to fetch escalation matrix for this team.');
    } finally {
      setLoadingTargets(false);
    }
  };

  const handleSubmitEscalation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!escalatingProposal) return;
    if (!selectedEscalationTargetId) {
      setEscalateModalError('Please select a valid escalation target from the matrix.');
      return;
    }
    if (!escalationReason.trim()) {
      setEscalateModalError('Escalation reason is required.');
      return;
    }

    setIsEscalatingSubmitting(true);
    try {
      await api.escalateWorkspaceSettingProposal(
        escalatingProposal.id,
        selectedEscalationTargetId,
        escalationReason.trim(),
        currentUser.id,
        currentUser.name
      );
      setEscalatingProposal(null);
      setProposalFeedbackMsg({
        type: 'success',
        text: `Proposal escalated to #${selectedEscalationTargetId} strictly following the team escalation matrix.`
      });
      setTimeout(() => setProposalFeedbackMsg(null), 4000);
      await fetchProposals();
    } catch (err: any) {
      setEscalateModalError(err.message || 'Failed to escalate proposal.');
    } finally {
      setIsEscalatingSubmitting(false);
    }
  };

  const handleSaveDraft = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      setFeedbackBanner({ type: 'success', text: 'Workspace preferences saved as draft.' });
      setTimeout(() => setFeedbackBanner(null), 3000);
    } catch (err) {
      console.warn('Could not save workspace draft:', err);
    }
  };

  const handleApplyChanges = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      setFeedbackBanner({ type: 'success', text: 'Workspace configuration applied successfully.' });
      setTimeout(() => setFeedbackBanner(null), 3000);
    } catch (err) {
      console.warn('Could not apply workspace changes:', err);
    }
  };

  const handleResetDefaults = () => {
    if (confirm('Reset all workspace settings to system defaults?')) {
      setConfig(DEFAULT_WORKSPACE_CONFIG);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_WORKSPACE_CONFIG));
      setFeedbackBanner({ type: 'success', text: 'Reset settings to system defaults.' });
      setTimeout(() => setFeedbackBanner(null), 3000);
    }
  };

  const pendingCount = proposals.filter(p => 
    p.status === 'PENDING_TEAM_APPROVAL' || 
    p.status === 'PENDING_CHECKER_REVIEW' || 
    p.status === 'ESCALATED_TO_TARGET_TEAM' || 
    p.status === 'ESCALATED'
  ).length;

  const envBadgeStyles = {
    Production: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Staging: 'bg-blue-50 text-[#155DFC] border-blue-200',
    Sandbox: 'bg-amber-50 text-amber-700 border-amber-200',
  }[config.environmentMode];

  const isDedicatedScreen = activeTab === 'db_config' || activeTab === 'validation_box' || activeTab === 'workflow_studio';

  return (
    <div className={`space-y-4 ${isDedicatedScreen ? 'w-full' : 'max-w-7xl mx-auto'}`} id="workspace-settings-container">
      {/* 1. Header with Title, Environment Badge, and 3-Tier Action Bar */}
      <header className="bg-white border border-slate-200/90 rounded-2xl px-5 py-3.5 text-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3" id="workspace-settings-header">
        <div className="flex items-center space-x-3">
          {onNavigateToWorkspace && (
            <button
              type="button"
              onClick={onNavigateToWorkspace}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition cursor-pointer border border-slate-200 shrink-0"
              title="Back to Workspace"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="p-2.5 bg-blue-50 text-[#155DFC] rounded-xl border border-blue-200/60 shrink-0">
            <Settings size={20} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold text-slate-900 tracking-tight font-mono">Workspace Settings</h1>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border ${envBadgeStyles}`}>
                {config.environmentMode}
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">
              Operational preferences, SLA governance, and rule engineering.
            </p>
          </div>
        </div>

        {/* 3-Tier Action Model */}
        <div className="flex items-center flex-wrap gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl text-xs font-mono font-semibold transition flex items-center space-x-1.5 border border-transparent hover:border-slate-200 cursor-pointer"
            title="Reset to default system configuration"
          >
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={handleSaveDraft}
            className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-mono font-bold flex items-center space-x-1.5 transition border border-slate-300/80 cursor-pointer shadow-2xs"
          >
            <Save size={13} />
            <span>Save Draft</span>
          </button>

          <button
            type="button"
            onClick={handleApplyChanges}
            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-mono font-bold flex items-center space-x-1.5 transition cursor-pointer shadow-xs"
          >
            <CheckCircle2 size={14} />
            <span>Apply Changes</span>
          </button>

          <button
            type="button"
            onClick={handleOpenSubmitProposal}
            className="px-3.5 py-1.5 bg-[#155DFC] hover:bg-blue-600 text-white rounded-xl text-xs font-mono font-bold flex items-center space-x-1.5 transition cursor-pointer shadow-xs"
            title="Submit proposal for Maker-Checker dual authorization"
          >
            <Send size={13} />
            <span>Submit for Approval</span>
          </button>
        </div>
      </header>

      {/* Global Feedback Banner */}
      {feedbackBanner && (
        <div className={`p-3 rounded-xl border text-xs font-mono font-medium flex items-center space-x-2 ${
          feedbackBanner.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {feedbackBanner.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{feedbackBanner.text}</span>
        </div>
      )}

      {/* 2. Main Content vs Dedicated Screen Switch */}
      {isDedicatedScreen ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden" id="dedicated-screen-container">
          {/* Top Bar with Back Link */}
          <div className="bg-slate-50/80 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                if (activeTab === 'workflow_studio') setActiveTab('workflow');
                else setActiveTab('governance');
              }}
              className="inline-flex items-center space-x-2 px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-700 hover:text-slate-900 transition shadow-2xs cursor-pointer"
            >
              <ArrowLeft size={14} />
              <span>Back to Settings</span>
            </button>
            <span className="text-xs font-mono font-bold text-slate-600">
              {activeTab === 'db_config' && 'DB Mirror Configuration Studio'}
              {activeTab === 'validation_box' && 'Validation Box Rules Manager'}
              {activeTab === 'workflow_studio' && 'Workflow Studio & Flowchart DAG Engine'}
            </span>
          </div>

          <div className="p-2 sm:p-4">
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
                { id: 'governance' as const, label: 'Governance', icon: ShieldCheck, desc: 'Approvals & Matrix', count: pendingCount },
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
                    {typeof item.count === 'number' && item.count > 0 && (
                      <span className="px-2 py-0.5 bg-amber-500 text-white font-mono font-bold text-[10px] rounded-full shadow-2xs">
                        {item.count}
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

            {activeTab === 'governance' && (
              <WorkspaceGovernanceTab
                currentUser={currentUser}
                proposals={proposals}
                loadingProposals={loadingProposals}
                proposalFilter={proposalFilter}
                setProposalFilter={setProposalFilter}
                proposalFeedbackMsg={proposalFeedbackMsg}
                reviewNotes={reviewNotes}
                setReviewNotes={setReviewNotes}
                reviewSubmittingId={reviewSubmittingId}
                onReviewProposal={handleReviewProposal}
                onEscalateProposal={handleOpenEscalateModal}
                onOpenSubmitProposal={handleOpenSubmitProposal}
                onOpenDbConfig={() => setActiveTab('db_config')}
                onOpenValidationBox={() => setActiveTab('validation_box')}
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

      {/* MODAL 1: SUBMIT NEW PROPOSAL (Maker Dual-Control) */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-50 px-5 py-3.5 text-slate-800 flex items-center justify-between border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-blue-50 text-[#155DFC] rounded-lg border border-blue-200/80">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 font-mono">Submit Workspace Setting Proposal</h3>
                  <p className="text-[11px] text-slate-500">Maker proposal awaiting Checker authorization</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitProposal} className="p-5 space-y-3.5 text-xs">
              {submitModalError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-center gap-2 font-mono">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{submitModalError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 font-mono">
                    Setting Domain
                  </label>
                  <select
                    value={submitSettingType}
                    onChange={(e) => {
                      const val = e.target.value as SettingProposalType;
                      setSubmitSettingType(val);
                      if (val === 'WORKSPACE_CONFIG') setSubmitSettingKey('workspace_config');
                    }}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold text-slate-900 font-mono"
                  >
                    <option value="WORKSPACE_CONFIG">Workspace Config (Preferences/SLA)</option>
                    <option value="SCHEMA_CONFIG">Schema Configuration</option>
                    <option value="TABLE_MAPPING">Table Mapping</option>
                    <option value="COLUMN_CONFIG">Column Configuration</option>
                    <option value="VALIDATION_BOX">Validation Box</option>
                    <option value="WORKFLOW">Validation Workflow</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 font-mono">
                    Setting Key Identifier
                  </label>
                  <input
                    type="text"
                    value={submitSettingKey}
                    onChange={(e) => setSubmitSettingKey(e.target.value)}
                    required
                    placeholder="e.g. workspace_config or schema_rules"
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 font-mono">
                  Proposal Title
                </label>
                <input
                  type="text"
                  value={submitTitle}
                  onChange={(e) => setSubmitTitle(e.target.value)}
                  required
                  placeholder="e.g. Adjust SLA Critical Resolution Target to 2 Hours"
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-medium text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 font-mono">
                  Business Justification (Auditable)
                </label>
                <textarea
                  rows={2}
                  value={submitJustification}
                  onChange={(e) => setSubmitJustification(e.target.value)}
                  required
                  placeholder="Explain why this setting change is necessary and which operational impact it addresses..."
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-normal text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 font-mono">
                  Proposed Changes (JSON Payload)
                </label>
                <textarea
                  rows={5}
                  value={submitProposedJson}
                  onChange={(e) => setSubmitProposedJson(e.target.value)}
                  required
                  className="w-full text-xs p-2.5 bg-[#060A14] border border-slate-800 text-emerald-400 rounded-xl focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono shadow-inner"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer font-mono"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingProposal}
                  className="px-4 py-1.5 bg-[#155DFC] hover:bg-blue-600 text-white rounded-xl text-xs font-bold font-mono transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmittingProposal ? 'Submitting...' : 'Submit Maker Proposal'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ESCALATE PROPOSAL (Matrix Bounded) */}
      {escalatingProposal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-50 px-5 py-3.5 text-slate-800 flex items-center justify-between border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-purple-50 text-purple-600 rounded-lg border border-purple-200/80">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 font-mono">Escalate Setting Proposal</h3>
                  <p className="text-[11px] text-slate-500">Strictly routing through team escalation matrix</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEscalatingProposal(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitEscalation} className="p-5 space-y-3.5 text-xs">
              {escalateModalError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-center gap-2 font-mono">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{escalateModalError}</span>
                </div>
              )}

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="text-[11px] text-slate-500 font-semibold font-mono">Target Proposal:</div>
                <div className="font-bold text-slate-900">{escalatingProposal.title}</div>
                <div className="text-[11px] text-slate-600 font-mono">Current Team: #{escalatingProposal.teamId}</div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 font-mono">
                  Select Escalation Target (From Matrix)
                </label>
                {loadingTargets ? (
                  <div className="p-3 text-center text-slate-500 font-mono">Loading escalation matrix...</div>
                ) : escalationTargets.length === 0 ? (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs font-mono">
                    No approved escalation targets defined in the matrix for team #{escalatingProposal.teamId}.
                  </div>
                ) : (
                  <select
                    value={selectedEscalationTargetId}
                    onChange={(e) => setSelectedEscalationTargetId(e.target.value)}
                    required
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold text-slate-900 font-mono"
                  >
                    {escalationTargets.map((t) => (
                      <option key={t.target_team_id} value={t.target_team_id}>
                        #{t.target_team_id} — {t.target_team_name} ({t.relationship_type})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 font-mono">
                  Escalation Reason &amp; Operational Context
                </label>
                <textarea
                  rows={3}
                  value={escalationReason}
                  onChange={(e) => setEscalationReason(e.target.value)}
                  required
                  placeholder="Explain why this proposal requires escalation to the selected team (e.g., cross-unit policy change)..."
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-normal text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEscalatingProposal(null)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer font-mono"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEscalatingSubmitting || escalationTargets.length === 0}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold font-mono transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>{isEscalatingSubmitting ? 'Escalating...' : 'Confirm Escalation'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
