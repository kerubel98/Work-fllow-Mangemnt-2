/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { queryPg } from '../config/postgres.js';
import { postgresRepo } from '../store/postgresRepo.js';
import { eventService } from './events.js';
import { workflowBundleService } from './workflowBundleService.js';

export interface UnifiedApprovalItem {
  id: string;
  type: 'TRANSACTION_RESOLUTION' | 'WORKFLOW_BUNDLE' | 'WORKSPACE_SETTING';
  title: string;
  description: string;
  makerId: string;
  makerName: string;
  teamId: string;
  teamName?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ESCALATED';
  evidenceSnapshot: Record<string, any>;
  proposedChanges: Record<string, any>;
  currentSnapshot?: Record<string, any>;
  checkerId?: string;
  checkerName?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  escalatedTeamId?: string;
  escalationReason?: string;
  createdAt: string;
}

export interface ProposeUnifiedInput {
  type: 'TRANSACTION_RESOLUTION' | 'WORKFLOW_BUNDLE' | 'WORKSPACE_SETTING';
  taskId?: string;
  transactionId?: string;
  bundleId?: string;
  targetScope?: 'PERSONAL' | 'TEAM' | 'GLOBAL_ENTERPRISE';
  settingType?: string;
  settingKey?: string;
  title?: string;
  teamId: string;
  teamName?: string;
  makerId: string;
  makerName: string;
  proposedAction?: string;
  proposedStatus?: string;
  proposedChanges?: Record<string, any>;
  currentSnapshot?: Record<string, any>;
  justification: string;
  evidenceSnapshot?: Record<string, any>;
}

export interface ReviewUnifiedInput {
  id: string;
  checkerId: string;
  checkerName: string;
  checkerTeamId?: string;
  action: 'APPROVE' | 'REJECT';
  reason?: string;
}

export interface EscalateUnifiedInput {
  id: string;
  escalatedById: string;
  escalatedByName: string;
  targetTeamId: string;
  reason: string;
}

/**
 * Dedicated domain adapter for financial transaction resolutions.
 */
export function adaptResolutionProposal(r: any): UnifiedApprovalItem {
  return {
    id: r.id,
    type: 'TRANSACTION_RESOLUTION',
    title: `Resolution: ${r.proposed_action || 'Override'} on ${r.transaction_id}`,
    description: r.justification_note || '',
    makerId: r.maker_id,
    makerName: r.maker_name,
    teamId: r.team_id,
    status: r.status === 'PENDING' ? 'PENDING' : r.status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
    evidenceSnapshot: r.evidence_snapshot || {},
    proposedChanges: {
      taskId: r.task_id,
      transactionId: r.transaction_id,
      proposedAction: r.proposed_action,
      proposedStatus: r.proposed_status
    },
    checkerId: r.checker_id,
    checkerName: r.checker_name,
    reviewedAt: r.reviewed_at,
    rejectionReason: r.rejection_reason,
    createdAt: r.created_at
  };
}

/**
 * Dedicated domain adapter for composite workflow bundles.
 */
export function adaptWorkflowBundle(b: any): UnifiedApprovalItem {
  let normalizedStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ESCALATED' = 'PENDING';
  if (b.status === 'APPROVED') normalizedStatus = 'APPROVED';
  else if (b.status === 'REJECTED') normalizedStatus = 'REJECTED';

  return {
    id: b.id,
    type: 'WORKFLOW_BUNDLE',
    title: `Workflow Bundle: ${b.name} (${b.bundleCode})`,
    description: b.description || `Promotion of workflow bundle to ${b.scope}`,
    makerId: b.makerId,
    makerName: b.makerName,
    teamId: b.sourceTeamId,
    teamName: b.sourceTeamName,
    status: normalizedStatus,
    evidenceSnapshot: b.evidenceSnapshot || {},
    proposedChanges: {
      bundleId: b.id,
      bundleCode: b.bundleCode,
      workflowId: b.workflowId,
      workflowName: b.workflowName,
      version: b.version,
      scope: b.scope,
      validationBoxIds: b.validationBoxIds,
      dbCheckIds: b.dbCheckIds
    },
    checkerId: b.checkerId,
    checkerName: b.checkerName,
    reviewedAt: b.approvedAt,
    rejectionReason: b.checkerFeedback,
    createdAt: b.createdAt
  };
}

/**
 * Dedicated domain adapter for workspace setting proposals.
 */
export function adaptWorkspaceSetting(p: any): UnifiedApprovalItem {
  let normalizedStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ESCALATED' = 'PENDING';
  if (p.status === 'APPROVED') normalizedStatus = 'APPROVED';
  else if (p.status === 'REJECTED') normalizedStatus = 'REJECTED';
  else if (p.status === 'ESCALATED_TO_TARGET_TEAM') normalizedStatus = 'ESCALATED';

  return {
    id: p.id,
    type: 'WORKSPACE_SETTING',
    title: p.title || `Setting Proposal: ${p.settingKey}`,
    description: p.justification || '',
    makerId: p.makerId,
    makerName: p.makerName,
    teamId: p.teamId,
    teamName: p.teamName,
    status: normalizedStatus,
    evidenceSnapshot: p.evidenceSnapshot || p.evidence_snapshot || {},
    proposedChanges: p.proposedChanges || {},
    currentSnapshot: p.currentSnapshot,
    checkerId: p.checkerId || p.reviewedBy,
    checkerName: p.checkerName || p.reviewerName,
    reviewedAt: p.appliedAt || p.reviewedAt,
    rejectionReason: p.checkerFeedback || p.reviewFeedback,
    escalatedTeamId: p.escalatedTeamId,
    escalationReason: p.escalationReason,
    createdAt: p.createdAt
  };
}

export const approvalService = {
  /**
   * Fetches unified approvals matching given filters.
   */
  async getApprovals(filters: {
    status?: string;
    teamId?: string;
    makerId?: string;
    type?: 'ALL' | 'TRANSACTION' | 'WORKFLOW_BUNDLE' | 'SETTING';
  }): Promise<UnifiedApprovalItem[]> {
    const results: UnifiedApprovalItem[] = [];
    const includeTxn = !filters.type || filters.type === 'ALL' || filters.type === 'TRANSACTION';
    const includeBundle = !filters.type || filters.type === 'ALL' || filters.type === 'WORKFLOW_BUNDLE';
    const includeSetting = !filters.type || filters.type === 'ALL' || filters.type === 'SETTING';

    // 1. Transaction resolutions (Strict Financial Governance)
    if (includeTxn) {
      try {
        let sql = `SELECT * FROM resolution_approval_requests WHERE 1=1`;
        const params: any[] = [];

        if (filters.status) {
          params.push(filters.status.toUpperCase());
          sql += ` AND status = $${params.length}`;
        }
        if (filters.teamId) {
          params.push(filters.teamId);
          sql += ` AND team_id = $${params.length}`;
        }
        if (filters.makerId) {
          params.push(filters.makerId);
          sql += ` AND maker_id = $${params.length}`;
        }

        sql += ` ORDER BY created_at DESC LIMIT 200`;
        const txnRes = await queryPg(sql, params);

        txnRes.rows.forEach(r => {
          results.push(adaptResolutionProposal(r));
        });
      } catch (err: any) {
        console.warn('[approvalService] Error querying resolution_approval_requests:', err.message);
      }
    }

    // 2. Composite Workflow Bundles (Strict Operational Governance)
    if (includeBundle) {
      try {
        const bundles = await workflowBundleService.getBundles({
          teamId: filters.teamId,
          status: filters.status,
          makerId: filters.makerId
        });

        bundles.forEach(b => {
          results.push(adaptWorkflowBundle(b));
        });
      } catch (err: any) {
        console.warn('[approvalService] Error querying workflow_bundles:', err.message);
      }
    }

    // 3. Workspace setting proposals (Legacy/Fallback)
    if (includeSetting) {
      try {
        const proposals = await postgresRepo.getWorkspaceSettingProposals(
          filters.teamId,
          filters.status ? (filters.status as any) : undefined
        );

        proposals.forEach(p => {
          if (filters.makerId && p.makerId !== filters.makerId) return;
          results.push(adaptWorkspaceSetting(p));
        });
      } catch (err: any) {
        console.warn('[approvalService] Error querying workspace setting proposals:', err.message);
      }
    }

    // Sort combined feed by createdAt DESC
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  /**
   * Dedicated domain query for financial transaction resolutions.
   */
  async getTransactionApprovals(filters: { status?: string; teamId?: string; makerId?: string }) {
    return this.getApprovals({ ...filters, type: 'TRANSACTION' });
  },

  /**
   * Dedicated domain query for composite workflow bundles.
   */
  async getWorkflowBundleApprovals(filters: { status?: string; teamId?: string; makerId?: string }) {
    return this.getApprovals({ ...filters, type: 'WORKFLOW_BUNDLE' });
  },

  /**
   * Fetches a single approval item by ID.
   */
  async getApprovalById(id: string): Promise<UnifiedApprovalItem | null> {
    // Check resolution requests first
    try {
      const res = await queryPg(`SELECT * FROM resolution_approval_requests WHERE id = $1`, [id]);
      if (res.rows.length > 0) {
        return adaptResolutionProposal(res.rows[0]);
      }
    } catch {
      // Ignore and check setting proposals
    }

    try {
      const p = await postgresRepo.getWorkspaceSettingProposalById(id);
      if (p) {
        return adaptWorkspaceSetting(p);
      }
    } catch {
      // Ignore
    }

    // Check workflow bundles
    try {
      const b = await workflowBundleService.getBundleById(id);
      if (b) {
        return adaptWorkflowBundle(b);
      }
    } catch {
      // Ignore
    }

    return null;
  },

  /**
   * Submits a Maker proposal.
   */
  async submitProposal(input: ProposeUnifiedInput): Promise<UnifiedApprovalItem> {
    if (!input.makerId || !input.justification) {
      throw new Error('Maker ID and justification are required to submit an approval proposal.');
    }

    const nowIso = new Date().toISOString();

    if (input.type === 'TRANSACTION_RESOLUTION') {
      if (!input.taskId || !input.transactionId) {
        throw new Error('Transaction resolutions require taskId and transactionId.');
      }
      if (!input.teamId || !input.teamId.trim()) {
        throw new Error('Transaction resolutions require teamId.');
      }
      if (!input.makerName || !input.makerName.trim()) {
        throw new Error('Transaction resolutions require makerName.');
      }
      if (!input.proposedAction || !input.proposedAction.trim()) {
        throw new Error('Transaction resolutions require proposedAction.');
      }
      const resolvedAction = input.proposedAction.trim();
      const resolvedStatus = (input.proposedStatus && input.proposedStatus.trim()) ||
        (resolvedAction === 'WRITE_OFF' ? 'WRITTEN_OFF' :
         resolvedAction === 'MANUAL_REVERSAL' ? 'MANUALLY_REVERSED' : 'VERIFIED_MATCH');

      const id = `res-req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const snapshotJson = JSON.stringify(input.evidenceSnapshot || {});

      const sql = `
        INSERT INTO resolution_approval_requests (
          id, task_id, transaction_id, team_id, maker_id, maker_name,
          proposed_action, proposed_status, justification_note, evidence_snapshot, status, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'PENDING', $11)
        RETURNING *;
      `;

      const res = await queryPg(sql, [
        id,
        input.taskId,
        input.transactionId,
        input.teamId.trim(),
        input.makerId,
        input.makerName.trim(),
        resolvedAction,
        resolvedStatus,
        input.justification,
        snapshotJson,
        nowIso
      ]);

      const row = res.rows[0];

      // Lock transaction status in PostgreSQL
      try {
        await queryPg(
          `UPDATE investigation_transactions 
           SET investigation_status = 'PENDING_CHECKER_REVIEW',
               status_flag_text = 'Pending Checker Approval',
               status_flag_color = 'amber',
               updated_at = NOW()
           WHERE task_id = $1 AND transaction_id = $2;`,
          [input.taskId, input.transactionId]
        );
      } catch (err: any) {
        console.warn(`[approvalService] Could not lock transaction status: ${err.message}`);
      }

      const item = adaptResolutionProposal(row);
      eventService.broadcastEvent('approval_proposal:created', item);
      return item;
    } else if (input.type === 'WORKFLOW_BUNDLE') {
      if (!input.bundleId) {
        throw new Error('bundleId is required to propose a workflow bundle promotion.');
      }
      const bundle = await workflowBundleService.proposePromotion(
        input.bundleId,
        input.targetScope || 'TEAM',
        input.makerId,
        input.makerName || input.makerId
      );

      const item = adaptWorkflowBundle(bundle);
      item.description = input.justification;

      eventService.broadcastEvent('approval_proposal:created', item);
      return item;
    } else {
      // Workspace setting proposal (Legacy fallback)
      const propId = `prop-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const proposal = await postgresRepo.createWorkspaceSettingProposal({
        id: propId,
        settingType: (input.settingType as any) || 'WORKSPACE_CONFIG',
        settingKey: input.settingKey || 'general_setting',
        title: input.title || `Setting Change: ${input.settingKey || 'Config'}`,
        proposedChanges: input.proposedChanges || {},
        currentSnapshot: input.currentSnapshot || {},
        justification: input.justification,
        makerId: input.makerId,
        makerName: input.makerName || input.makerId,
        teamId: input.teamId || 'default-team',
        teamName: input.teamName || 'General Team',
        status: 'PENDING_TEAM_APPROVAL',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // Save evidence snapshot if column exists
      if (input.evidenceSnapshot) {
        try {
          await queryPg(
            `UPDATE workspace_setting_proposals SET evidence_snapshot = $1::jsonb WHERE id = $2`,
            [JSON.stringify(input.evidenceSnapshot), proposal.id]
          );
        } catch {
          // Non-blocking
        }
      }

      const item = adaptWorkspaceSetting(proposal);
      if (input.evidenceSnapshot) {
        item.evidenceSnapshot = input.evidenceSnapshot;
      }

      eventService.broadcastEvent('approval_proposal:created', item);
      return item;
    }
  },

  /**
   * Reviews a proposal (Checker).
   * Enforces Anti-Self-Approval (makerId !== checkerId).
   */
  async reviewProposal(input: ReviewUnifiedInput): Promise<UnifiedApprovalItem> {
    if (!input.id || !input.checkerId || !input.action) {
      throw new Error('Proposal ID, Checker ID, and Action (APPROVE/REJECT) are required.');
    }
    if (!input.checkerName || !input.checkerName.trim()) {
      throw new Error('Missing required field: checkerName is mandatory for reviewing proposal.');
    }
    if (input.action === 'REJECT' && (!input.reason || !input.reason.trim())) {
      throw new Error('Missing required field: reason is mandatory when rejecting a proposal.');
    }

    // Try workflow bundle review first if ID indicates a bundle
    if (input.id.startsWith('bundle-')) {
      const bundle = await workflowBundleService.reviewPromotion(
        input.id,
        input.checkerId,
        input.checkerName.trim(),
        input.action,
        input.reason
      );

      const item = adaptWorkflowBundle(bundle);
      return item;
    }

    // Try transaction resolution next
    const txnCheck = await queryPg(`SELECT * FROM resolution_approval_requests WHERE id = $1`, [input.id]);
    if (txnCheck.rows.length > 0) {
      const proposal = txnCheck.rows[0];

      // Anti-Self-Approval Enforcement (Four-Eyes Principle)
      if (proposal.maker_id === input.checkerId) {
        throw new Error(`Anti-Self-Approval Violation: Maker '${proposal.maker_name}' cannot approve their own submission.`);
      }

      await queryPg('BEGIN;');
      try {
        const isApprove = input.action === 'APPROVE';
        const newStatus = isApprove ? 'APPROVED' : 'REJECTED';

        const updateSql = `
          UPDATE resolution_approval_requests
          SET status = $1,
              checker_id = $2,
              checker_name = $3,
              rejection_reason = $4,
              reviewed_at = NOW()
          WHERE id = $5
          RETURNING *;
        `;

        const updateRes = await queryPg(updateSql, [
          newStatus,
          input.checkerId,
          input.checkerName.trim(),
          isApprove ? null : input.reason!.trim(),
          input.id
        ]);

        const updatedRow = updateRes.rows[0];

        // Update transaction status in PostgreSQL
        if (isApprove) {
          const targetStatus = proposal.proposed_status || 'VERIFIED_MATCH';
          await queryPg(
            `UPDATE investigation_transactions 
             SET final_result = 'PASS',
                 final_action = 'CLOSE',
                 investigation_status = $1,
                 status_flag_text = $2,
                 status_flag_color = 'emerald',
                 updated_at = NOW()
             WHERE task_id = $3 AND transaction_id = $4;`,
            [targetStatus, `Approved by ${input.checkerName.trim()}`, proposal.task_id, proposal.transaction_id]
          );
        } else {
          await queryPg(
            `UPDATE investigation_transactions 
             SET final_result = 'FAIL',
                 investigation_status = 'FLAGGED_DISCREPANCY',
                 status_flag_text = $1,
                 status_flag_color = 'rose',
                 updated_at = NOW()
             WHERE task_id = $2 AND transaction_id = $3;`,
            [`Rejected: ${input.reason!.trim()}`, proposal.task_id, proposal.transaction_id]
          );
        }

        await queryPg('COMMIT;');

        const item = adaptResolutionProposal(updatedRow);
        eventService.broadcastEvent('approval_proposal:reviewed', item);
        return item;
      } catch (err) {
        await queryPg('ROLLBACK;');
        throw err;
      }
    }

    // Try workspace setting proposal
    const existingSetting = await postgresRepo.getWorkspaceSettingProposalById(input.id);
    if (!existingSetting) {
      throw new Error(`Proposal '${input.id}' not found.`);
    }

    // Anti-Self-Approval Enforcement (Four-Eyes Principle)
    if (existingSetting.makerId === input.checkerId) {
      throw new Error(`Anti-Self-Approval Violation: Maker '${existingSetting.makerName}' cannot approve their own setting proposal.`);
    }

    const updatedSetting = await postgresRepo.reviewWorkspaceSettingProposal(
      input.id,
      input.checkerId,
      input.checkerName.trim(),
      input.action,
      input.reason
    );

    const item = adaptWorkspaceSetting(updatedSetting);
    eventService.broadcastEvent('approval_proposal:reviewed', item);
    return item;
  },

  /**
   * Escalates a proposal to a target team.
   */
  async escalateProposal(input: EscalateUnifiedInput): Promise<UnifiedApprovalItem> {
    if (!input.id || !input.targetTeamId || !input.reason) {
      throw new Error('Proposal ID, target team ID, and reason are required to escalate.');
    }

    const updated = await postgresRepo.escalateWorkspaceSettingProposal(
      input.id,
      input.targetTeamId,
      input.reason,
      input.escalatedById,
      input.escalatedByName
    );

    const item: UnifiedApprovalItem = {
      id: updated.id,
      type: 'WORKSPACE_SETTING',
      title: updated.title,
      description: updated.justification,
      makerId: updated.makerId,
      makerName: updated.makerName,
      teamId: updated.teamId,
      teamName: updated.teamName,
      status: 'ESCALATED',
      evidenceSnapshot: (updated as any).evidenceSnapshot || {},
      proposedChanges: updated.proposedChanges,
      currentSnapshot: updated.currentSnapshot,
      escalatedTeamId: updated.escalatedTeamId,
      escalationReason: updated.escalationReason,
      createdAt: updated.createdAt
    };

    eventService.broadcastEvent('approval_proposal:escalated', item);
    return item;
  }
};
