import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { WorkspaceSettingProposal, WorkflowBundle, User } from '../types';
import { api } from '../api/client';

interface GovernanceContextType {
  // Legacy proposals (for backwards compatibility)
  proposals: WorkspaceSettingProposal[];
  loading: boolean;
  error: string | null;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  escalatedCount: number;
  refetchProposals: () => Promise<void>;
  submitProposal: (proposalData: Partial<WorkspaceSettingProposal>) => Promise<WorkspaceSettingProposal>;
  reviewProposal: (
    proposal: WorkspaceSettingProposal, 
    action: 'APPROVE' | 'REJECT', 
    feedback?: string
  ) => Promise<WorkspaceSettingProposal>;
  escalateProposal: (
    proposalId: string, 
    targetTeamId: string, 
    reason: string
  ) => Promise<WorkspaceSettingProposal>;

  // Domain Segregation: Financial Transaction Approvals
  transactionApprovals: any[];
  pendingTransactionCount: number;
  reviewTransactionApproval: (
    id: string,
    action: 'APPROVE' | 'REJECT',
    reason?: string
  ) => Promise<any>;

  // Domain Segregation: Composite Workflow Bundles
  workflowBundleApprovals: any[];
  workflowBundles: WorkflowBundle[];
  pendingBundleCount: number;
  refetchBundles: () => Promise<void>;
  createBundle: (bundleData: {
    name: string;
    description?: string;
    version?: string;
    scope?: string;
    workflowId: string;
    validationBoxIds?: string[];
    dbCheckIds?: string[];
    hashtagBindings?: string[];
  }) => Promise<WorkflowBundle>;
  proposeBundlePromotion: (
    bundleId: string,
    targetScope: 'PERSONAL' | 'TEAM' | 'GLOBAL_ENTERPRISE'
  ) => Promise<WorkflowBundle>;
  reviewBundlePromotion: (
    bundleId: string,
    action: 'APPROVE' | 'REJECT',
    feedback?: string
  ) => Promise<WorkflowBundle>;
}

const GovernanceContext = createContext<GovernanceContextType | undefined>(undefined);

export const GovernanceProvider: React.FC<{ 
  children: ReactNode; 
  currentUser: User; 
  userTeamId?: string;
}> = ({ children, currentUser, userTeamId }) => {
  const [proposals, setProposals] = useState<WorkspaceSettingProposal[]>([]);
  const [transactionApprovals, setTransactionApprovals] = useState<any[]>([]);
  const [workflowBundleApprovals, setWorkflowBundleApprovals] = useState<any[]>([]);
  const [workflowBundles, setWorkflowBundles] = useState<WorkflowBundle[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [propsRes, txnRes, wfBundleApprovalsRes, bundlesRes] = await Promise.allSettled([
        api.getWorkspaceSettingProposals({ teamId: userTeamId }),
        api.getTransactionApprovals({ teamId: userTeamId }),
        api.getWorkflowBundleApprovals({ teamId: userTeamId }),
        api.getWorkflowBundles({ teamId: userTeamId })
      ]);

      if (propsRes.status === 'fulfilled') {
        setProposals(Array.isArray(propsRes.value) ? propsRes.value : []);
      }
      if (txnRes.status === 'fulfilled') {
        setTransactionApprovals(Array.isArray(txnRes.value) ? txnRes.value : []);
      }
      if (wfBundleApprovalsRes.status === 'fulfilled') {
        setWorkflowBundleApprovals(Array.isArray(wfBundleApprovalsRes.value) ? wfBundleApprovalsRes.value : []);
      }
      if (bundlesRes.status === 'fulfilled') {
        setWorkflowBundles(Array.isArray(bundlesRes.value) ? bundlesRes.value : []);
      }
    } catch (err: any) {
      console.error('[GovernanceContext] Failed to load governance data:', err);
      setError(err.message || 'Failed to load governance data');
    } finally {
      setLoading(false);
    }
  }, [userTeamId]);

  useEffect(() => {
    refetchAll();
  }, [refetchAll]);

  // Legacy proposal methods
  const submitProposal = useCallback(async (proposalData: Partial<WorkspaceSettingProposal>) => {
    try {
      const payload: Partial<WorkspaceSettingProposal> = {
        ...proposalData,
        makerId: currentUser.id,
        makerName: currentUser.displayName || currentUser.username,
        teamId: proposalData.teamId || userTeamId || 'default'
      };
      const created = await api.createWorkspaceSettingProposal(payload);
      await refetchAll();
      return created;
    } catch (err: any) {
      console.error('[GovernanceContext] Submit proposal error:', err);
      throw err;
    }
  }, [currentUser, userTeamId, refetchAll]);

  const reviewProposal = useCallback(async (
    proposal: WorkspaceSettingProposal, 
    action: 'APPROVE' | 'REJECT', 
    feedback?: string
  ) => {
    if (currentUser.id === proposal.makerId) {
      const antiSelfMsg = 'Anti-Self-Approval Violation: As Maker of this proposal, you cannot approve or reject it. A separate Checker is required.';
      throw new Error(antiSelfMsg);
    }

    try {
      const reviewed = await api.reviewWorkspaceSettingProposal(
        proposal.id,
        action,
        currentUser.id,
        currentUser.displayName || currentUser.username,
        feedback
      );
      await refetchAll();
      return reviewed;
    } catch (err: any) {
      console.error('[GovernanceContext] Review proposal error:', err);
      throw err;
    }
  }, [currentUser, refetchAll]);

  const escalateProposal = useCallback(async (
    proposalId: string, 
    targetTeamId: string, 
    reason: string
  ) => {
    try {
      const escalated = await api.escalateWorkspaceSettingProposal(
        proposalId,
        targetTeamId,
        reason,
        currentUser.id,
        currentUser.displayName || currentUser.username
      );
      await refetchAll();
      return escalated;
    } catch (err: any) {
      console.error('[GovernanceContext] Escalate proposal error:', err);
      throw err;
    }
  }, [currentUser, refetchAll]);

  // Transaction approval reviews
  const reviewTransactionApproval = useCallback(async (
    id: string,
    action: 'APPROVE' | 'REJECT',
    reason?: string
  ) => {
    const item = transactionApprovals.find(t => t.id === id);
    if (item && item.makerId === currentUser.id) {
      throw new Error('Anti-Self-Approval Violation: As Maker of this resolution, you cannot approve or reject it.');
    }
    const reviewed = await api.reviewApproval(
      id,
      action,
      currentUser.id,
      currentUser.displayName || currentUser.username,
      reason
    );
    await refetchAll();
    return reviewed;
  }, [currentUser, transactionApprovals, refetchAll]);

  // Workflow Bundle Methods
  const createBundle = useCallback(async (bundleData: {
    name: string;
    description?: string;
    version?: string;
    scope?: string;
    workflowId: string;
    validationBoxIds?: string[];
    dbCheckIds?: string[];
    hashtagBindings?: string[];
  }) => {
    const created = await api.createWorkflowBundle({
      ...bundleData,
      sourceTeamId: userTeamId || 'default',
      makerId: currentUser.id,
      makerName: currentUser.displayName || currentUser.username
    });
    await refetchAll();
    return created;
  }, [currentUser, userTeamId, refetchAll]);

  const proposeBundlePromotion = useCallback(async (
    bundleId: string,
    targetScope: 'PERSONAL' | 'TEAM' | 'GLOBAL_ENTERPRISE'
  ) => {
    const res = await api.proposeWorkflowBundlePromotion(
      bundleId,
      targetScope,
      currentUser.id,
      currentUser.displayName || currentUser.username
    );
    await refetchAll();
    return res;
  }, [currentUser, refetchAll]);

  const reviewBundlePromotion = useCallback(async (
    bundleId: string,
    action: 'APPROVE' | 'REJECT',
    feedback?: string
  ) => {
    const bundle = workflowBundles.find(b => b.id === bundleId);
    if (bundle && bundle.makerId === currentUser.id) {
      throw new Error('Anti-Self-Approval Violation: As Maker of this workflow bundle, you cannot approve or reject it.');
    }
    const res = await api.reviewWorkflowBundlePromotion(
      bundleId,
      action,
      currentUser.id,
      currentUser.displayName || currentUser.username,
      feedback
    );
    await refetchAll();
    return res;
  }, [currentUser, workflowBundles, refetchAll]);

  const pendingCount = proposals.filter(p => p.status === 'PENDING_TEAM_APPROVAL').length;
  const approvedCount = proposals.filter(p => p.status === 'APPROVED').length;
  const rejectedCount = proposals.filter(p => p.status === 'REJECTED').length;
  const escalatedCount = proposals.filter(p => p.status === 'ESCALATED_TO_TARGET_TEAM').length;

  const pendingTransactionCount = transactionApprovals.filter(t => t.status === 'PENDING').length;
  const pendingBundleCount = workflowBundleApprovals.filter(b => b.status === 'PENDING').length;

  return (
    <GovernanceContext.Provider value={{
      proposals,
      loading,
      error,
      pendingCount,
      approvedCount,
      rejectedCount,
      escalatedCount,
      refetchProposals: refetchAll,
      submitProposal,
      reviewProposal,
      escalateProposal,

      transactionApprovals,
      pendingTransactionCount,
      reviewTransactionApproval,

      workflowBundleApprovals,
      workflowBundles,
      pendingBundleCount,
      refetchBundles: refetchAll,
      createBundle,
      proposeBundlePromotion,
      reviewBundlePromotion
    }}>
      {children}
    </GovernanceContext.Provider>
  );
};

const defaultGovernanceContext: GovernanceContextType = {
  proposals: [],
  loading: false,
  error: null,
  pendingCount: 0,
  approvedCount: 0,
  rejectedCount: 0,
  escalatedCount: 0,
  refetchProposals: async () => {},
  submitProposal: async (d) => d as any,
  reviewProposal: async (p) => p,
  escalateProposal: async () => ({} as any),
  transactionApprovals: [],
  pendingTransactionCount: 0,
  reviewTransactionApproval: async () => ({}),
  workflowBundleApprovals: [],
  workflowBundles: [],
  pendingBundleCount: 0,
  refetchBundles: async () => {},
  createBundle: async () => ({} as any),
  proposeBundlePromotion: async () => ({} as any),
  reviewBundlePromotion: async () => ({} as any),
};

export const useGovernance = (): GovernanceContextType => {
  const ctx = useContext(GovernanceContext);
  return ctx || defaultGovernanceContext;
};
