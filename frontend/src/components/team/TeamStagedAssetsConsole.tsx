import React, { useState, useEffect } from 'react';
import { Team, User } from '../../types';
import { api } from '../../api/client';
import { AssetStatusBadge } from '../common/AssetStatusBadge';
import { 
  Boxes, GitFork, CheckCircle2, AlertTriangle, Play, Lock, 
  Unlock, Plus, RefreshCw, Database, Filter, Layers, 
  Search, ShieldCheck, Check, X, Clock, ChevronDown, ChevronRight, FileCode
} from 'lucide-react';

interface StagedAsset {
  id: string;
  name: string;
  assetType: 'WORKFLOW' | 'VALIDATION_BOX' | 'DB_CONFIG';
  description?: string;
  status: 'DRAFT' | 'PENDING_CHECKER_TEST' | 'APPROVED' | 'DECLINED';
  isLocked: boolean;
  makerId: string;
  makerName: string;
  teamId?: string;
  approvedByUserId?: string;
  approvedByUserName?: string;
  approvedAt?: string;
  checkerFeedback?: string;
  visualPayload?: any;
  createdAt?: string;
  updatedAt?: string;
}

interface TeamStagedAssetsConsoleProps {
  currentTeam: Team;
  currentUser: User;
  onAssetAdopted?: (asset: any) => void;
}

export const TeamStagedAssetsConsole: React.FC<TeamStagedAssetsConsoleProps> = ({
  currentTeam,
  currentUser,
  onAssetAdopted
}) => {
  const [stagedAssets, setStagedAssets] = useState<StagedAsset[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [selectedType, setSelectedType] = useState<'ALL' | 'WORKFLOW' | 'VALIDATION_BOX' | 'DB_CONFIG'>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<'ALL' | 'PENDING_CHECKER_TEST' | 'APPROVED' | 'DECLINED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Interactive Test State
  const [testingAssetId, setTestingAssetId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);

  // Approval / Decline Modal State
  const [actionAsset, setActionAsset] = useState<StagedAsset | null>(null);
  const [actionType, setActionType] = useState<'APPROVE' | 'DECLINE' | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // Adoption state
  const [adoptingId, setAdoptingId] = useState<string | null>(null);

  const fetchStagedAssets = async () => {
    if (!currentTeam?.id) return;
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.getTeamStagedAssets(currentTeam.id);
      if (res && res.success) {
        const combined: StagedAsset[] = [
          ...(res.workflows || []).map((w: any) => ({ ...w, assetType: 'WORKFLOW' as const })),
          ...(res.validationBoxes || []).map((b: any) => ({ ...b, assetType: 'VALIDATION_BOX' as const })),
          ...(res.dbConfigs || []).map((c: any) => ({ ...c, assetType: 'DB_CONFIG' as const }))
        ];
        setStagedAssets(combined);
      }
    } catch (err: any) {
      console.error('Failed to load staged assets:', err);
      setErrorMsg(err.message || 'Failed to load team staged assets.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStagedAssets();
  }, [currentTeam?.id]);

  // Filtered Assets
  const filteredAssets = stagedAssets.filter(asset => {
    if (selectedType !== 'ALL' && asset.assetType !== selectedType) return false;
    if (selectedStatus !== 'ALL' && asset.status !== selectedStatus) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = (asset.name || '').toLowerCase().includes(q);
      const matchDesc = (asset.description || '').toLowerCase().includes(q);
      const matchMaker = (asset.makerName || '').toLowerCase().includes(q);
      if (!matchName && !matchDesc && !matchMaker) return false;
    }
    return true;
  });

  // Handler: Run Sandbox Test
  const handleRunTest = async (asset: StagedAsset) => {
    setTestingAssetId(asset.id);
    setErrorMsg(null);
    try {
      const res = await api.testOperationalAsset(asset.assetType, asset.id, 10);
      if (res && res.success) {
        setTestResult(res.testResult);
        setShowTestModal(true);
      }
    } catch (err: any) {
      setErrorMsg(`Test run failed: ${err.message}`);
    } finally {
      setTestingAssetId(null);
    }
  };

  // Handler: 1-Click Workspace Adoption
  const handleAdoptAsset = async (asset: StagedAsset) => {
    setAdoptingId(asset.id);
    setErrorMsg(null);
    try {
      const res = await api.adoptOperationalAsset(asset.assetType, asset.id);
      if (res && res.success) {
        setSuccessMsg(`"${asset.name}" adopted into your personal workspace as an editable draft.`);
        if (onAssetAdopted) onAssetAdopted(res.asset);
        setTimeout(() => setSuccessMsg(null), 4000);
      }
    } catch (err: any) {
      setErrorMsg(`Adoption failed: ${err.message}`);
    } finally {
      setAdoptingId(null);
    }
  };

  // Handler: Open Approve Dialog
  const handleOpenApprove = (asset: StagedAsset) => {
    // Check Anti-Self-Approval
    const isMaker = asset.makerId === currentUser.id || asset.makerName === currentUser.username;
    const isGlobalAdmin = currentUser.role === 'admin' || (currentUser.role as any) === 'system_admin';
    if (isMaker && !isGlobalAdmin) {
      setErrorMsg(`Anti-Self-Approval Violation: You created "${asset.name}". In accordance with Four-Eyes governance, another team checker must test and approve it.`);
      setTimeout(() => setErrorMsg(null), 6000);
      return;
    }
    setActionAsset(asset);
    setActionType('APPROVE');
    setFeedbackText('Verified against sample live transactions. Passed all schema checks.');
  };

  // Handler: Open Decline Dialog
  const handleOpenDecline = (asset: StagedAsset) => {
    setActionAsset(asset);
    setActionType('DECLINE');
    setFeedbackText('');
  };

  // Handler: Submit Approve / Decline
  const handleSubmitAction = async () => {
    if (!actionAsset || !actionType) return;
    setIsSubmittingAction(true);
    setErrorMsg(null);
    try {
      if (actionType === 'APPROVE') {
        const res = await api.approveOperationalAsset(actionAsset.assetType, actionAsset.id, feedbackText);
        if (res && res.success) {
          setSuccessMsg(`Asset "${actionAsset.name}" approved and locked for production!`);
        }
      } else {
        if (!feedbackText.trim()) {
          setErrorMsg('Please provide a reason or feedback for declining this asset.');
          setIsSubmittingAction(false);
          return;
        }
        const res = await api.declineOperationalAsset(actionAsset.assetType, actionAsset.id, feedbackText);
        if (res && res.success) {
          setSuccessMsg(`Asset "${actionAsset.name}" marked as declined with feedback.`);
        }
      }
      setActionAsset(null);
      setActionType(null);
      await fetchStagedAssets();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setErrorMsg(`Action failed: ${err.message}`);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // Handler: Unlock Asset (Checker-only)
  const handleUnlockAsset = async (asset: StagedAsset) => {
    if (!confirm(`Unlock "${asset.name}" to allow modifications? Only the authorized checker should do this.`)) return;
    setErrorMsg(null);
    try {
      const res = await api.unlockOperationalAsset(asset.assetType, asset.id);
      if (res && res.success) {
        setSuccessMsg(`"${asset.name}" unlocked for modification.`);
        await fetchStagedAssets();
        setTimeout(() => setSuccessMsg(null), 4000);
      }
    } catch (err: any) {
      setErrorMsg(`Unlock failed: ${err.message}`);
    }
  };

  const getAssetIcon = (type: string) => {
    switch (type) {
      case 'WORKFLOW':
        return <GitFork size={15} className="text-blue-600" />;
      case 'VALIDATION_BOX':
        return <Filter size={15} className="text-purple-600" />;
      case 'DB_CONFIG':
        return <Database size={15} className="text-emerald-600" />;
      default:
        return <Boxes size={15} className="text-slate-600" />;
    }
  };

  const isCheckerForAsset = (asset: StagedAsset) => {
    return asset.approvedByUserId === currentUser.id || currentUser.role === 'admin' || (currentUser.role as any) === 'system_admin';
  };

  return (
    <div className="space-y-4 font-mono text-xs" id="team-staged-assets-console">
      {/* Banner & Overview */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-950 text-white p-5 rounded-2xl shadow-sm border border-blue-800/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3.5">
          <div className="p-2.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 rounded-xl shrink-0 mt-0.5">
            <ShieldCheck size={24} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <h3 className="text-sm font-bold tracking-wide uppercase">Team Resource Center &amp; Verification Console</h3>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/30 text-blue-200 border border-blue-400/40 text-[10px] font-bold">
                Maker-Checker Staging
              </span>
            </div>
            <p className="text-xs text-blue-200/80 font-sans leading-relaxed max-w-2xl">
              Shared workflows, validation boxes, and DB configs staged for <strong>@{currentTeam?.name}</strong>. Checkers test rules hands-on against live sample data before locking for production. Team members can clone any asset with 1-click adoption.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={fetchStagedAssets}
          disabled={isLoading}
          className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold flex items-center space-x-2 transition-all cursor-pointer shadow-xs self-start md:self-auto shrink-0 disabled:opacity-50"
          title="Refresh Staged Assets"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          <span>Refresh Staged</span>
        </button>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-emerald-900 text-xs flex items-center gap-2 font-sans font-medium">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-rose-900 text-xs flex items-center gap-2 font-sans font-medium">
          <AlertTriangle size={16} className="text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Control Bar: Filters & Search */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        {/* Type Filter Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-slate-500 mr-1">Asset:</span>
          {(['ALL', 'WORKFLOW', 'VALIDATION_BOX', 'DB_CONFIG'] as const).map(type => (
            <button
              key={type}
              type="button"
              onClick={() => setSelectedType(type)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                selectedType === type
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {type === 'ALL' ? 'All Types' : type.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-bold text-slate-500 mr-1">Status:</span>
          {(['ALL', 'PENDING_CHECKER_TEST', 'APPROVED', 'DECLINED'] as const).map(status => (
            <button
              key={status}
              type="button"
              onClick={() => setSelectedStatus(status)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                selectedStatus === status
                  ? 'bg-slate-800 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {status === 'ALL' ? 'All Statuses' : status.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search staged assets..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
          />
        </div>
      </div>

      {/* Asset Cards Grid */}
      {isLoading ? (
        <div className="p-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center space-y-2">
          <RefreshCw size={20} className="animate-spin text-blue-600" />
          <span>Loading staged operational assets...</span>
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="p-10 text-center bg-white rounded-2xl border border-dashed border-slate-200 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
            <Boxes size={24} />
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-slate-800 text-sm">No Staged Assets Found</h4>
            <p className="text-xs text-slate-500 font-sans max-w-md mx-auto">
              {stagedAssets.length === 0
                ? 'No workflows, validation boxes, or DB configs have been shared with this team yet. Use the Share button on any asset in your workspace to stage it here.'
                : 'No assets match your current filter selections.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAssets.map(asset => {
            const isApproved = asset.status === 'APPROVED';
            const isLocked = asset.isLocked;
            const isMaker = asset.makerId === currentUser.id || asset.makerName === currentUser.username;
            const canUnlock = isLocked && (isCheckerForAsset(asset) || currentUser.role === 'admin');

            return (
              <div
                key={`${asset.assetType}_${asset.id}`}
                className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs hover:shadow-xs transition-all space-y-3 flex flex-col justify-between"
              >
                {/* Top Row: Type Pill, Status Badge, Lock */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-md font-bold text-[10px] text-slate-700 flex items-center gap-1.5">
                        {getAssetIcon(asset.assetType)}
                        <span>{asset.assetType.replace('_', ' ')}</span>
                      </span>
                      {isLocked && (
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-md text-[10px] font-bold flex items-center gap-1" title="Post-Approval Lock Active">
                          <Lock size={10} className="text-amber-600" />
                          <span>LOCKED</span>
                        </span>
                      )}
                    </div>

                    <AssetStatusBadge status={asset.status} />
                  </div>

                  {/* Title and Description */}
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{asset.name}</h4>
                    {asset.description && (
                      <p className="text-[11px] text-slate-500 font-sans mt-0.5 line-clamp-2">
                        {asset.description}
                      </p>
                    )}
                  </div>

                  {/* Visual Payload Specs */}
                  {asset.visualPayload && (
                    <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl space-y-1 text-[10px] text-slate-600">
                      {asset.assetType === 'WORKFLOW' && (
                        <div className="flex items-center justify-between">
                          <span>Stages: <strong>{asset.visualPayload.stepsCount || 0} DAG steps</strong></span>
                          <span>Target DB: <strong>{asset.visualPayload.targetDbId || 'Settlement Mirror'}</strong></span>
                        </div>
                      )}
                      {asset.assetType === 'VALIDATION_BOX' && (
                        <div className="flex items-center justify-between">
                          <span>Box Type: <strong>{asset.visualPayload.boxType || 'Validation'}</strong></span>
                          <span>Target: <strong>{asset.visualPayload.targetTable || 'Transactions'}</strong></span>
                        </div>
                      )}
                      {asset.assetType === 'DB_CONFIG' && (
                        <div className="flex items-center justify-between">
                          <span>Database: <strong>{asset.visualPayload.databaseName}</strong></span>
                          <span>Table: <strong>{asset.visualPayload.tableName}</strong></span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Checker Feedback / Rejection Note */}
                  {asset.checkerFeedback && (
                    <div className={`p-2 rounded-xl border text-[11px] font-sans ${
                      isApproved 
                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800' 
                        : 'bg-rose-50/70 border-rose-200 text-rose-800'
                    }`}>
                      <div className="font-bold font-mono text-[10px] flex items-center gap-1">
                        {isApproved ? <Check size={11} /> : <AlertTriangle size={11} />}
                        <span>Checker Note:</span>
                      </div>
                      <p className="mt-0.5">{asset.checkerFeedback}</p>
                    </div>
                  )}

                  {/* Attribution Footer */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                    <span>Maker: <strong className="text-slate-700">@{asset.makerName}</strong></span>
                    {asset.approvedByUserName && (
                      <span>Checker: <strong className="text-emerald-700">@{asset.approvedByUserName}</strong></span>
                    )}
                  </div>
                </div>

                {/* Actions Toolbar */}
                <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  {/* Left: 1-Click Workspace Adoption (Peer-to-Peer / Self-Service) */}
                  <button
                    type="button"
                    onClick={() => handleAdoptAsset(asset)}
                    disabled={adoptingId === asset.id}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 text-[11px]"
                    title="Clone directly into your personal workspace as an editable draft"
                  >
                    <Plus size={12} className={adoptingId === asset.id ? 'animate-spin' : 'text-blue-600'} />
                    <span>{adoptingId === asset.id ? 'Cloning...' : 'Add to My Workspace'}</span>
                  </button>

                  {/* Right: Hands-On Checker Controls */}
                  <div className="flex items-center space-x-1.5">
                    {/* Live Test */}
                    <button
                      type="button"
                      onClick={() => handleRunTest(asset)}
                      disabled={testingAssetId === asset.id}
                      className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-50 text-[11px]"
                      title="Test this asset against sample live transactions"
                    >
                      <Play size={11} className={testingAssetId === asset.id ? 'animate-spin' : 'text-blue-600'} />
                      <span>{testingAssetId === asset.id ? 'Testing...' : 'Test Sandbox'}</span>
                    </button>

                    {/* Approve / Lock */}
                    {!isApproved && (
                      <button
                        type="button"
                        onClick={() => handleOpenApprove(asset)}
                        className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center gap-1 transition cursor-pointer text-[11px] shadow-2xs"
                        title="Approve and place post-approval edit lock"
                      >
                        <ShieldCheck size={12} />
                        <span>Approve</span>
                      </button>
                    )}

                    {/* Decline */}
                    {!isApproved && asset.status !== 'DECLINED' && (
                      <button
                        type="button"
                        onClick={() => handleOpenDecline(asset)}
                        className="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl font-bold transition cursor-pointer text-[11px]"
                        title="Decline with feedback"
                      >
                        <X size={12} />
                      </button>
                    )}

                    {/* Unlock (Checker Only) */}
                    {canUnlock && (
                      <button
                        type="button"
                        onClick={() => handleUnlockAsset(asset)}
                        className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl font-bold flex items-center gap-1 transition cursor-pointer text-[11px]"
                        title="Authorized Checker: Unlock asset to permit modifications"
                      >
                        <Unlock size={11} />
                        <span>Unlock</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Sandbox Test Results */}
      {showTestModal && testResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl border border-blue-500/30">
                  <Play size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Sandbox Test Execution Verdict</h3>
                  <p className="text-slate-400 text-[11px]">Verified on sample transactions in {testResult.durationMs}ms</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Metrics */}
            <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-4 gap-3 text-center">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-500 block">Total Tested</span>
                <span className="text-base font-bold text-slate-900">{testResult.totalTransactionsTested}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <span className="text-[10px] text-emerald-600 block">Passed</span>
                <span className="text-base font-bold text-emerald-600">{testResult.passedCount}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <span className="text-[10px] text-rose-600 block">Failed</span>
                <span className="text-base font-bold text-rose-600">{testResult.failedCount}</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-500 block">Latency</span>
                <span className="text-base font-bold text-slate-800">{testResult.durationMs}ms</span>
              </div>
            </div>

            {/* Results breakdown */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <span className="font-bold text-slate-700 text-[11px] block">Transaction Test Samples:</span>
              {(testResult.sampleResults || []).map((sample: any, idx: number) => (
                <div
                  key={idx}
                  className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-[11px]"
                >
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-800 font-mono">{sample.transactionId}</span>
                    <p className="text-slate-500 font-sans text-[10px]">{sample.details}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                    sample.verdict === 'PASS' 
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                      : 'bg-rose-100 text-rose-800 border border-rose-200'
                  }`}>
                    {sample.verdict}
                  </span>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold cursor-pointer"
              >
                Close Results
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Approve or Decline Dialog */}
      {actionAsset && actionType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                {actionType === 'APPROVE' ? (
                  <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                    <ShieldCheck size={18} />
                  </div>
                ) : (
                  <div className="p-2 bg-rose-100 text-rose-700 rounded-xl">
                    <AlertTriangle size={18} />
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-sm text-slate-900">
                    {actionType === 'APPROVE' ? 'Approve & Lock Asset' : 'Decline Asset'}
                  </h3>
                  <span className="text-[10px] text-slate-400">@{actionAsset.name}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setActionAsset(null); setActionType(null); }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {actionType === 'APPROVE' && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-[11px] font-sans">
                <strong>Four-Eyes Verification:</strong> Approving this asset marks it as <code>APPROVED</code> and places an immutable edit lock. Only you (the approving checker) can unlock or modify it in the future.
              </div>
            )}

            <div className="space-y-1.5">
              <label className="font-bold text-slate-700 text-[11px] block">
                {actionType === 'APPROVE' ? 'Verification Review Notes:' : 'Reason for Declining (Required):'}
              </label>
              <textarea
                rows={3}
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value)}
                placeholder={actionType === 'APPROVE' ? 'Optional verification feedback...' : 'Specify which rule or column configuration needs revision...'}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans text-slate-800 focus:outline-none focus:border-blue-500 focus:bg-white"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => { setActionAsset(null); setActionType(null); }}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitAction}
                disabled={isSubmittingAction}
                className={`px-4 py-1.5 text-white font-bold rounded-xl transition cursor-pointer flex items-center space-x-1.5 disabled:opacity-50 ${
                  actionType === 'APPROVE' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {isSubmittingAction ? (
                  <span>Processing...</span>
                ) : (
                  <>
                    {actionType === 'APPROVE' ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}
                    <span>{actionType === 'APPROVE' ? 'Approve & Lock' : 'Decline Asset'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
