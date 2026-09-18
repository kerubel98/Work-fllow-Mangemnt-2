/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense, lazy } from 'react';
import { User, DatabaseConnection, WorkspaceSettingProposal, SettingProposalType, SettingProposalStatus, TeamEscalationTarget } from '../types';
import { 
  Settings, Sliders, Bell, Clock, 
  Save, RotateCcw, 
  FileSpreadsheet, Volume2, 
  ArrowLeft, CheckCircle2, AlertTriangle, ShieldCheck,
  Boxes, GitFork, FileCheck, Send, ArrowUpRight, XCircle, AlertCircle, X, ShieldAlert, Filter
} from 'lucide-react';
import { api } from '../api/client';
import ErrorBoundary from './ErrorBoundary';

const DatabaseColumnConfigurationStudio = lazy(() => import('./settings/DatabaseColumnConfiguration'));
const ValidationBoxManager = lazy(() => import('./settings/ValidationBoxManager').then(m => ({ default: m.ValidationBoxManager })));
const WorkflowStudioFlowchart = lazy(() => import('./settings/WorkflowStudioFlowchart').then(m => ({ default: m.WorkflowStudioFlowchart })));

function StudioLoadingFallback() {
  return (
    <div className="w-full h-80 flex flex-col items-center justify-center gap-3 p-8 bg-white rounded-xl border border-slate-200">
      <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin" />
      <span className="text-xs font-semibold text-slate-500">Loading Studio Canvas...</span>
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

interface WorkspaceSettingsProps {
  currentUser: User;
  databases?: DatabaseConnection[];
  onNavigateToWorkspace?: () => void;
  selectedWorkflowId?: string;
}

export default function WorkspaceSettings({
  currentUser,
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

  const [activeTab, setActiveTab] = useState<'database_validation' | 'validation_box' | 'workflow_studio' | 'pending_approvals' | 'general' | 'workflow' | 'notifications' | 'data_grid'>('database_validation');
  const [saveBanner, setSaveBanner] = useState(false);

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
      setActiveTab('pending_approvals');
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

  const pendingCount = proposals.filter(p => 
    p.status === 'PENDING_TEAM_APPROVAL' || 
    p.status === 'PENDING_CHECKER_REVIEW' || 
    p.status === 'ESCALATED_TO_TARGET_TEAM' || 
    p.status === 'ESCALATED'
  ).length;

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
    { id: 'database_validation', label: 'DB Config', icon: ShieldCheck },
    { id: 'validation_box', label: 'Validation Box', icon: Boxes },
    { id: 'workflow_studio', label: 'Workflow Studio', icon: GitFork },
    { id: 'pending_approvals', label: 'Setting Approvals', icon: FileCheck, count: pendingCount },
    { id: 'general', label: 'General', icon: Sliders },
    { id: 'workflow', label: 'Workflow & SLA', icon: Clock },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'data_grid', label: 'Data & Export', icon: FileSpreadsheet }
  ] as const;

  return (
    <div className={`space-y-3 ${activeTab === 'database_validation' || activeTab === 'validation_box' || activeTab === 'workflow_studio' ? 'w-full' : 'max-w-7xl mx-auto'}`}>
      {/* 1. Sleek Compact Header Bar */}
      <div className="bg-white border border-slate-200/90 rounded-2xl px-3.5 py-2.5 text-slate-800 shadow-xs flex items-center justify-between gap-2 overflow-x-auto no-scrollbar" id="workspace-settings-header">
        <div className="flex items-center gap-2.5 shrink-0">
          {onNavigateToWorkspace && (
            <button
              type="button"
              onClick={onNavigateToWorkspace}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-lg transition cursor-pointer border border-slate-200 shrink-0"
              title="Back to Workspace"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="p-1.5 bg-blue-50 text-[#155DFC] rounded-lg border border-blue-200/60 shrink-0">
            <Settings className="w-4 h-4" />
          </div>
          <div className="shrink-0">
            <h1 className="text-xs sm:text-sm font-bold text-slate-900 tracking-tight whitespace-nowrap">Workspace Settings</h1>
            <p className="text-[11px] text-slate-500 truncate hidden xl:block">Manage preferences, operational rules, and validation workflows</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border border-slate-200 cursor-pointer shrink-0 whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
          <button
            type="button"
            onClick={handleOpenSubmitProposal}
            className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition border border-indigo-200/80 shadow-xs cursor-pointer shrink-0 whitespace-nowrap"
            title="Submit setting changes for Maker-Checker Team Approval"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Submit for Team Approval</span>
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-3 py-1.5 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer shrink-0 whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Changes</span>
          </button>
        </div>
      </div>

      {/* Save Success Banner */}
      {saveBanner && (
        <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex items-center gap-2 text-xs font-semibold shadow-2xs animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span>Workspace preferences have been saved and applied.</span>
        </div>
      )}

      {/* Proposal Feedback Banner */}
      {proposalFeedbackMsg && (
        <div className={`p-2.5 rounded-xl flex items-center gap-2 text-xs font-semibold shadow-2xs animate-fadeIn ${
          proposalFeedbackMsg.type === 'success'
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
            : 'bg-rose-50 border border-rose-200 text-rose-900'
        }`}>
          {proposalFeedbackMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          )}
          <span>{proposalFeedbackMsg.text}</span>
        </div>
      )}

      {/* 2. Modern Segmented Tab Bar (Full Width) */}
      <div className="flex items-center gap-1 p-1 bg-slate-100/90 border border-slate-200 rounded-2xl overflow-x-auto no-scrollbar" id="workspace-settings-tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const count = 'count' in tab ? (tab as any).count : 0;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition whitespace-nowrap cursor-pointer shrink-0 ${
                isActive
                  ? 'bg-[#155DFC] text-white shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
              {typeof count === 'number' && count > 0 && (
                <span className="px-1.5 py-0.2 bg-amber-500 text-white font-bold text-[10px] rounded-full">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 3. Settings Content Pane */}
      <Suspense fallback={<StudioLoadingFallback />}>
      {activeTab === 'database_validation' ? (
        <ErrorBoundary fallbackTitle="Column Configuration Error" fallbackMessage="Could not render Database Column Configuration Studio. You can retry or refresh.">
          <DatabaseColumnConfigurationStudio
            currentUser={currentUser}
            databases={databases}
          />
        </ErrorBoundary>
      ) : activeTab === 'validation_box' ? (
        <ErrorBoundary fallbackTitle="Validation Box Error" fallbackMessage="Could not render Validation Box interface.">
          <ValidationBoxManager currentUser={currentUser} />
        </ErrorBoundary>
      ) : activeTab === 'workflow_studio' ? (
        <ErrorBoundary fallbackTitle="Workflow Studio Error" fallbackMessage="Could not render Workflow Studio Flowchart.">
          <WorkflowStudioFlowchart 
            currentUser={currentUser}
            selectedWorkflowId={selectedWorkflowId}
          />
        </ErrorBoundary>
      ) : activeTab === 'pending_approvals' ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-blue-600" />
                Workspace Setting Change Proposals
              </h2>
              <p className="text-xs text-slate-500">
                Maker-Checker dual authorization and team matrix escalation for schema configs, table mappings, validation boxes, and workflows.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenSubmitProposal}
              className="px-3 py-1.5 bg-[#155DFC] hover:bg-[#155DFC]/90 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>+ New Proposal</span>
            </button>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {[
              { id: 'ALL', label: 'All Proposals', count: proposals.length },
              { id: 'PENDING', label: 'Pending Review', count: proposals.filter(p => p.status === 'PENDING_TEAM_APPROVAL' || p.status === 'PENDING_CHECKER_REVIEW').length },
              { id: 'APPROVED', label: 'Approved', count: proposals.filter(p => p.status === 'APPROVED').length },
              { id: 'REJECTED', label: 'Rejected', count: proposals.filter(p => p.status === 'REJECTED').length },
              { id: 'ESCALATED', label: 'Escalated', count: proposals.filter(p => p.status === 'ESCALATED_TO_TARGET_TEAM' || p.status === 'ESCALATED').length },
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setProposalFilter(f.id as any)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                  proposalFilter === f.id
                    ? 'bg-slate-900 text-white font-bold shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{f.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  proposalFilter === f.id ? 'bg-slate-800 text-slate-200' : 'bg-slate-200 text-slate-700'
                }`}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>

          {/* Proposals List */}
          {loadingProposals ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">Loading team setting proposals...</span>
            </div>
          ) : (() => {
            const filtered = proposals.filter(p => {
              if (proposalFilter === 'PENDING') return p.status === 'PENDING_TEAM_APPROVAL' || p.status === 'PENDING_CHECKER_REVIEW';
              if (proposalFilter === 'APPROVED') return p.status === 'APPROVED';
              if (proposalFilter === 'REJECTED') return p.status === 'REJECTED';
              if (proposalFilter === 'ESCALATED') return p.status === 'ESCALATED_TO_TARGET_TEAM' || p.status === 'ESCALATED';
              return true;
            });

            if (filtered.length === 0) {
              return (
                <div className="py-12 text-center text-slate-500 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <FileCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold">No setting proposals found</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Click "Submit for Team Approval" to create a Maker proposal for this team.
                  </p>
                </div>
              );
            }

            return (
              <div className="space-y-3">
                {filtered.map(p => {
                  const isPending = p.status === 'PENDING_TEAM_APPROVAL' || p.status === 'PENDING_CHECKER_REVIEW';
                  const isEscalated = p.status === 'ESCALATED_TO_TARGET_TEAM' || p.status === 'ESCALATED';
                  const isApproved = p.status === 'APPROVED';
                  const isRejected = p.status === 'REJECTED';
                  const isMaker = currentUser.id === p.makerId;

                  return (
                    <div
                      key={p.id}
                      className={`p-4 rounded-xl border transition shadow-2xs space-y-3 ${
                        isPending
                          ? 'bg-amber-50/20 border-amber-200'
                          : isEscalated
                          ? 'bg-purple-50/20 border-purple-200'
                          : isApproved
                          ? 'bg-emerald-50/20 border-emerald-200'
                          : 'bg-rose-50/20 border-rose-200'
                      }`}
                    >
                      {/* Top Meta */}
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold flex items-center gap-1 border ${
                              isPending
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : isEscalated
                                ? 'bg-purple-100 text-purple-800 border-purple-300'
                                : isApproved
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-rose-100 text-rose-800 border-rose-300'
                            }`}>
                              {isPending && <Clock className="w-3 h-3" />}
                              {isEscalated && <ArrowUpRight className="w-3 h-3" />}
                              {isApproved && <CheckCircle2 className="w-3 h-3" />}
                              {isRejected && <XCircle className="w-3 h-3" />}
                              <span>{p.status}</span>
                            </span>

                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                              {p.settingType}
                            </span>

                            <code className="text-xs bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded font-mono font-medium">
                              {p.settingKey}
                            </code>
                          </div>
                          <h3 className="text-sm font-bold text-slate-900">{p.title}</h3>
                          <div className="text-[11px] text-slate-500">
                            Maker: <span className="font-semibold text-slate-700">{p.makerName || p.makerId}</span> (#{p.teamId}) • {new Date(p.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      {/* Justification */}
                      <div className="text-xs bg-slate-50 border-l-3 border-indigo-500 pl-3 py-1.5 text-slate-700 italic rounded-r">
                        <span className="font-semibold not-italic text-slate-600 mr-1.5">Business Justification:</span>
                        "{p.justification}"
                      </div>

                      {/* Escalation Traceability */}
                      {(isEscalated || p.escalatedTeamId || p.targetTeamId) && (
                        <div className="p-2.5 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-900 flex items-start gap-2">
                          <ArrowUpRight className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold">Escalated to #{p.escalatedTeamId || p.targetTeamId}</span>
                            {p.escalatedByName && <span className="text-purple-700"> by {p.escalatedByName}</span>}
                            {p.escalationReason && (
                              <div className="text-[11px] text-purple-800 mt-0.5">
                                Reason: {p.escalationReason}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Review Details */}
                      {(isApproved || isRejected) && (p.checkerId || p.reviewedBy) && (
                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700">
                          <span className="font-bold">{isApproved ? 'Approved & Applied' : 'Rejected'}</span> by{' '}
                          <span className="font-semibold">{p.checkerName || p.reviewedBy}</span>
                          {(p.appliedAt || p.reviewedAt) && <span> on {new Date(p.appliedAt || p.reviewedAt).toLocaleString()}</span>}
                          {(p.checkerFeedback || p.reviewFeedback) && (
                            <div className="text-[11px] text-slate-600 mt-0.5 italic">
                              Checker Feedback: "{p.checkerFeedback || p.reviewFeedback}"
                            </div>
                          )}
                        </div>
                      )}

                      {/* Proposed Changes Code Snippet */}
                      <details className="group">
                        <summary className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer select-none flex items-center gap-1.5 py-1">
                          <span>View Proposed Changes Payload</span>
                        </summary>
                        <pre className="mt-1 p-3 bg-[#060A14] border border-slate-800 text-emerald-400 font-mono text-[11px] rounded-xl overflow-x-auto max-h-52">
                          {JSON.stringify(p.proposedChanges, null, 2)}
                        </pre>
                      </details>

                      {/* Action Bar (Maker-Checker & Escalation) */}
                      {(isPending || isEscalated) && (
                        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-200/80">
                          {isMaker ? (
                            <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg text-xs font-medium">
                              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                              <span>Anti-Self-Approval Active: As Maker, you cannot approve your own proposal. A separate team Checker must review it.</span>
                            </div>
                          ) : (
                            <div className="flex-1 min-w-[240px]">
                              <input
                                type="text"
                                placeholder="Checker review notes / conditions..."
                                value={reviewNotes[p.id] || ''}
                                onChange={(e) => setReviewNotes({ ...reviewNotes, [p.id]: e.target.value })}
                                className="w-full text-xs px-3 py-1.5 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                              />
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            {!isMaker && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleReviewProposal(p, 'APPROVE')}
                                  disabled={reviewSubmittingId === p.id}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-2xs cursor-pointer disabled:opacity-50"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Approve & Apply</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReviewProposal(p, 'REJECT')}
                                  disabled={reviewSubmittingId === p.id}
                                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-2xs cursor-pointer disabled:opacity-50"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  <span>Reject</span>
                                </button>
                              </>
                            )}

                            <button
                              type="button"
                              onClick={() => handleOpenEscalateModal(p)}
                              className="px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                              title="Escalate setting proposal strictly along team escalation matrix"
                            >
                              <ArrowUpRight className="w-3.5 h-3.5 text-purple-700" />
                              <span>Escalate</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
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
      </Suspense>

      {/* MODAL 1: SUBMIT SETTING PROPOSAL */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-50 px-5 py-3.5 text-slate-800 flex items-center justify-between border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg border border-indigo-200/80">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Submit Workspace Setting Proposal</h3>
                  <p className="text-[11px] text-slate-500">Maker-Checker dual authorization proposal for team review</p>
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
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{submitModalError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Setting Type
                  </label>
                  <select
                    value={submitSettingType}
                    onChange={(e) => {
                      const val = e.target.value as SettingProposalType;
                      setSubmitSettingType(val);
                      if (val === 'WORKSPACE_CONFIG') setSubmitSettingKey('workspace_config');
                      else if (val === 'SCHEMA_CONFIG') setSubmitSettingKey('schema_rules');
                      else if (val === 'TABLE_MAPPING') setSubmitSettingKey('table_mapping');
                      else if (val === 'COLUMN_CONFIG') setSubmitSettingKey('column_config');
                      else if (val === 'VALIDATION_BOX') setSubmitSettingKey('validation_box');
                      else if (val === 'WORKFLOW') setSubmitSettingKey('workflow_pipeline');
                    }}
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold text-slate-900"
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Proposed Changes (JSON Payload)
                </label>
                <textarea
                  rows={6}
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
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingProposal}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmittingProposal ? 'Submitting Proposal...' : 'Submit Maker Proposal'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: ESCALATE PROPOSAL (Strictly bounded by team escalation matrix) */}
      {escalatingProposal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="bg-slate-50 px-5 py-3.5 text-slate-800 flex items-center justify-between border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-purple-50 text-purple-600 rounded-lg border border-purple-200/80">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Escalate Setting Proposal</h3>
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
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{escalateModalError}</span>
                </div>
              )}

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <div className="text-[11px] text-slate-500 font-semibold">Target Proposal:</div>
                <div className="font-bold text-slate-900">{escalatingProposal.title}</div>
                <div className="text-[11px] text-slate-600 font-mono">Current Team: #{escalatingProposal.teamId}</div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select Escalation Target (From Escalation Matrix)
                </label>
                {loadingTargets ? (
                  <div className="p-3 text-center text-slate-500">Loading escalation matrix...</div>
                ) : escalationTargets.length === 0 ? (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
                    No approved escalation targets defined in the matrix for team #{escalatingProposal.teamId}.
                  </div>
                ) : (
                  <select
                    value={selectedEscalationTargetId}
                    onChange={(e) => setSelectedEscalationTargetId(e.target.value)}
                    required
                    className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-semibold text-slate-900"
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Escalation Reason & Operational Context
                </label>
                <textarea
                  rows={3}
                  value={escalationReason}
                  onChange={(e) => setEscalationReason(e.target.value)}
                  required
                  placeholder="Explain why this proposal requires escalation to the selected team (e.g., cross-unit policy change, higher authorization limit)..."
                  className="w-full text-xs p-2 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-normal text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEscalatingProposal(null)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEscalatingSubmitting || escalationTargets.length === 0}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
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
