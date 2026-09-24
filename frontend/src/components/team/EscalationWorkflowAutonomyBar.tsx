import React, { useState, useEffect } from 'react';
import { Issue, User } from '../../types';
import { api } from '../../api/client';
import { AssetStatusBadge } from '../common/AssetStatusBadge';
import { 
  GitFork, Play, Trash2, ArrowLeftRight, AlertTriangle, 
  CheckCircle2, RefreshCw, Send, Check, X, ShieldAlert, FileCode
} from 'lucide-react';

interface EscalationWorkflowAutonomyBarProps {
  issue: Issue;
  currentUser: User;
  onUpdateIssue?: (updatedIssue: Issue) => void;
  onRequestRevisions?: (revisionNote: string) => void;
  onExecuteSandbox?: (workflowId: string, issueId: string) => void;
}

export const EscalationWorkflowAutonomyBar: React.FC<EscalationWorkflowAutonomyBarProps> = ({
  issue,
  currentUser,
  onUpdateIssue,
  onRequestRevisions,
  onExecuteSandbox
}) => {
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionText, setRevisionText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Test state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);

  const workflowId = issue.workflowId;
  const workflowName = issue.workflowName || (workflowId ? `Workflow #${workflowId.slice(0, 8)}` : null);
  const workflowStatus = issue.workflowStatus || (workflowId ? 'DRAFT' : null);
  const isApproved = workflowStatus === 'APPROVED';

  // Load available workflows when swapping
  const handleOpenSwap = async () => {
    setIsLoadingWorkflows(true);
    setShowSwapModal(true);
    try {
      const data = await api.getWorkflows();
      setWorkflows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.warn('Failed to fetch workflows:', err);
    } finally {
      setIsLoadingWorkflows(false);
    }
  };

  // Swap workflow
  const handleSwapWorkflow = async (targetWf: any) => {
    setIsSubmitting(true);
    try {
      const updated = await api.updateIssue(issue.id, {
        workflowId: targetWf.id,
        workflowName: targetWf.name,
        workflowStatus: targetWf.status || 'DRAFT'
      });
      setStatusMessage({
        type: 'success',
        text: `Swapped issue workflow to: "${targetWf.name}"`
      });
      setShowSwapModal(false);
      if (onUpdateIssue && updated) {
        onUpdateIssue({
          ...issue,
          workflowId: targetWf.id,
          workflowName: targetWf.name,
          workflowStatus: targetWf.status || 'DRAFT'
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Failed to swap workflow: ${err.message}` });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  // Remove workflow from issue
  const handleRemoveWorkflow = async () => {
    if (!confirm('Are you sure you want to remove the attached workflow from this escalated issue? You can swap it with your own workflow later.')) return;
    setIsSubmitting(true);
    try {
      const updated = await api.updateIssue(issue.id, {
        workflowId: undefined,
        workflowName: undefined,
        workflowStatus: undefined
      });
      setStatusMessage({
        type: 'success',
        text: 'Workflow detached from issue.'
      });
      if (onUpdateIssue && updated) {
        onUpdateIssue({
          ...issue,
          workflowId: undefined,
          workflowName: undefined,
          workflowStatus: undefined
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Failed to remove workflow: ${err.message}` });
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  // Test workflow against issue data
  const handleTestWorkflow = async () => {
    if (!workflowId) return;
    setIsTesting(true);
    try {
      const res = await api.testOperationalAsset('WORKFLOW', workflowId, 10);
      if (res && res.success) {
        setTestResult(res.testResult);
        setShowTestModal(true);
      }
      if (onExecuteSandbox) {
        onExecuteSandbox(workflowId, issue.id);
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Sandbox test execution failed: ${err.message}` });
      setTimeout(() => setStatusMessage(null), 4000);
    } finally {
      setIsTesting(false);
    }
  };

  // Submit revision request
  const handleSubmitRevision = () => {
    if (!revisionText.trim()) return;
    if (onRequestRevisions) {
      onRequestRevisions(revisionText.trim());
    }
    setStatusMessage({
      type: 'success',
      text: 'Revision feedback sent to escalating team in discussion stream.'
    });
    setRevisionText('');
    setShowRevisionModal(false);
    setTimeout(() => setStatusMessage(null), 4000);
  };

  return (
    <div className="bg-slate-50 border-b border-slate-200 p-3.5 space-y-2 font-mono text-xs" id="escalation-workflow-autonomy-bar">
      {/* Top line: Attached Workflow Info & Status */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
            <GitFork size={14} />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-slate-800">
                {workflowName ? `Attached DAG: ${workflowName}` : 'No Workflow Attached to Escalation'}
              </span>
              {workflowStatus && <AssetStatusBadge status={workflowStatus} />}
            </div>
            <span className="text-[10px] text-slate-400 font-sans">
              Technical specialist holds full autonomy to test, swap, or request modifications to this pipeline.
            </span>
          </div>
        </div>

        {/* Action Buttons for Technical Handler */}
        <div className="flex items-center space-x-1.5 flex-wrap">
          {workflowId && (
            <button
              type="button"
              onClick={handleTestWorkflow}
              disabled={isTesting}
              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer text-[11px] shadow-2xs disabled:opacity-50"
              title="Test workflow validity against issue dataset in sandbox"
            >
              <Play size={12} className={isTesting ? 'animate-spin' : ''} />
              <span>{isTesting ? 'Testing...' : 'Test on Issue Data'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenSwap}
            className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer text-[11px]"
            title="Swap with personal or approved team workflow"
          >
            <ArrowLeftRight size={12} className="text-purple-600" />
            <span>{workflowId ? 'Swap Workflow' : 'Attach Workflow'}</span>
          </button>

          {workflowId && (
            <button
              type="button"
              onClick={() => setShowRevisionModal(true)}
              className="px-2.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg font-bold flex items-center gap-1.5 transition cursor-pointer text-[11px]"
              title="Indicate changes or corrections needed on this workflow"
            >
              <FileCode size={12} className="text-amber-600" />
              <span>Request Changes</span>
            </button>
          )}

          {workflowId && (
            <button
              type="button"
              onClick={handleRemoveWorkflow}
              disabled={isSubmitting}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
              title="Remove workflow from issue"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Prominent Warning Banner if Unapproved */}
      {workflowId && !isApproved && (
        <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 flex items-start space-x-2 font-sans text-xs">
          <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold font-mono">⚠️ Unapproved Escalation Workflow: </span>
            This workflow is currently in <strong className="font-mono">[{workflowStatus}]</strong> status and has <strong>not</strong> been officially verified by the escalating team's checker. As the technical handler, please verify with "Test on Issue Data" or swap with your own verified workflow before applying.
          </div>
        </div>
      )}

      {/* Feedback status */}
      {statusMessage && (
        <div className={`p-2 rounded-xl text-xs flex items-center gap-2 font-sans ${
          statusMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
        }`}>
          {statusMessage.type === 'success' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* MODAL: Swap Workflow Modal */}
      {showSwapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <ArrowLeftRight size={16} className="text-purple-600" />
                <h3 className="font-bold text-sm text-slate-900">Select Workflow to Attach / Swap</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSwapModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-[11px] text-slate-500 font-sans">
              Choose from your personal workflows or team-approved workflows to replace the current issue pipeline.
            </p>

            {isLoadingWorkflows ? (
              <div className="py-8 text-center text-slate-500">
                <RefreshCw size={18} className="animate-spin mx-auto text-purple-600 mb-2" />
                <span>Loading available workflows...</span>
              </div>
            ) : workflows.length === 0 ? (
              <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                No workflows found in your workspace. Build one in Workflow Studio first.
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {workflows.map(wf => (
                  <div
                    key={wf.id}
                    onClick={() => handleSwapWorkflow(wf)}
                    className="p-3 bg-slate-50 hover:bg-purple-50/60 border border-slate-200 hover:border-purple-300 rounded-xl transition cursor-pointer flex items-center justify-between"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-slate-900">{wf.name}</span>
                        <AssetStatusBadge status={wf.status || 'DRAFT'} />
                      </div>
                      <p className="text-[10px] text-slate-500 font-sans truncate max-w-xs">{wf.description || 'No description'}</p>
                    </div>

                    <button
                      type="button"
                      className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold text-[10px]"
                    >
                      Use This
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSwapModal(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Request Revisions Modal */}
      {showRevisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <FileCode size={16} className="text-amber-600" />
                <h3 className="font-bold text-sm text-slate-900">Indicate Changes for Escalating Team</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRevisionModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-[11px] text-slate-500 font-sans">
              Even if a workflow is approved, you can demand specific parameter, rule, or mirror mapping adjustments from the originating team.
            </p>

            <div className="space-y-1">
              <label className="font-bold text-slate-700 text-[11px]">Required Adjustments:</label>
              <textarea
                rows={3}
                value={revisionText}
                onChange={e => setRevisionText(e.target.value)}
                placeholder="e.g., Please update stage 2 mirror match condition to include card_last_4..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-sans text-slate-800 focus:outline-none focus:border-amber-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowRevisionModal(false)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmitRevision}
                disabled={!revisionText.trim()}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Send size={12} />
                <span>Post Revision Notice</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Sandbox Test Result Details */}
      {showTestModal && testResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[85vh] overflow-hidden font-mono text-xs">
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Play size={16} className="text-emerald-400" />
                <h3 className="font-bold text-sm">Issue Workflow Simulation Verdict</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-4 gap-2.5 text-center">
              <div className="bg-white p-2 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 block">Tested</span>
                <span className="font-bold text-slate-800">{testResult.totalTransactionsTested}</span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-slate-200">
                <span className="text-[10px] text-emerald-600 block">Passed</span>
                <span className="font-bold text-emerald-600">{testResult.passedCount}</span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-slate-200">
                <span className="text-[10px] text-rose-600 block">Failed</span>
                <span className="font-bold text-rose-600">{testResult.failedCount}</span>
              </div>
              <div className="bg-white p-2 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 block">Duration</span>
                <span className="font-bold text-slate-800">{testResult.durationMs}ms</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              <span className="font-bold text-slate-700 block">Sample Inspection Breakdown:</span>
              {(testResult.sampleResults || []).map((sample: any, idx: number) => (
                <div
                  key={idx}
                  className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-[11px]"
                >
                  <div>
                    <span className="font-bold text-slate-800">{sample.transactionId}</span>
                    <p className="text-slate-500 font-sans text-[10px]">{sample.details}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                    sample.verdict === 'PASS' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {sample.verdict}
                  </span>
                </div>
              ))}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowTestModal(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
