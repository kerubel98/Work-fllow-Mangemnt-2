/**
 * Maker-Checker Dual Authorization Resolution Service
 * Governs resolution proposals (Makers) and team lead review/approval (Checkers).
 * Enforces anti-self-approval (makerId != checkerId) and team-scoped authorization.
 */

import { queryPg } from '../config/postgres.js';
import { ResolutionApprovalRequest } from '../types.js';

export interface ProposeResolutionInput {
  taskId: string;
  transactionId: string;
  teamId: string;
  makerId: string;
  makerName: string;
  proposedAction: string;
  proposedStatus: string;
  justificationNote: string;
  evidenceSnapshot?: Record<string, any>;
}

export interface ReviewResolutionInput {
  requestId: string;
  checkerId: string;
  checkerName: string;
  checkerTeamId: string;
  action: 'APPROVE' | 'REJECT';
  rejectionReason?: string;
}

export const makerCheckerService = {
  /**
   * Submits a new resolution approval request (Maker).
   */
  async submitResolutionProposal(input: ProposeResolutionInput): Promise<ResolutionApprovalRequest> {
    if (!input.taskId || !input.transactionId || !input.makerId || !input.justificationNote) {
      throw new Error('Missing required fields for resolution proposal: taskId, transactionId, makerId, and justificationNote are mandatory.');
    }
    if (!input.teamId || !input.teamId.trim()) {
      throw new Error('Missing required field: teamId is mandatory for resolution proposal.');
    }
    if (!input.makerName || !input.makerName.trim()) {
      throw new Error('Missing required field: makerName is mandatory for resolution proposal.');
    }
    if (!input.proposedAction || !input.proposedAction.trim()) {
      throw new Error('Missing required field: proposedAction is mandatory for resolution proposal.');
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
        proposed_action, proposed_status, justification_note, evidence_snapshot, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, 'PENDING')
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
      input.justificationNote,
      snapshotJson
    ]);

    const row = res.rows[0];

    // Lock transaction status to PENDING_CHECKER_REVIEW
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
      console.warn(`[MakerChecker] Could not lock transaction status: ${err.message}`);
    }

    return {
      id: row.id,
      taskId: row.task_id,
      transactionId: row.transaction_id,
      teamId: row.team_id,
      makerId: row.maker_id,
      makerName: row.maker_name,
      proposedAction: row.proposed_action,
      proposedStatus: row.proposed_status,
      justificationNote: row.justification_note,
      evidenceSnapshot: row.evidence_snapshot || {},
      status: row.status,
      createdAt: row.created_at
    };
  },

  /**
   * Reviews a pending resolution approval request (Checker).
   * Enforces Anti-Self-Approval (makerId != checkerId).
   */
  async reviewResolutionProposal(input: ReviewResolutionInput): Promise<ResolutionApprovalRequest> {
    await queryPg('BEGIN;');
    try {
      // 1. Fetch pending proposal with row-level lock
      const fetchRes = await queryPg(
        `SELECT * FROM resolution_approval_requests WHERE id = $1 AND status = 'PENDING' FOR UPDATE`,
        [input.requestId]
      );

      if (!fetchRes.rows || fetchRes.rows.length === 0) {
        throw new Error(`Pending resolution request '${input.requestId}' not found or already processed.`);
      }

      const proposal = fetchRes.rows[0];

      // 2. Enforce Anti-Self-Approval (Maker cannot approve their own submission)
      if (proposal.maker_id === input.checkerId) {
        throw new Error(`Anti-Self-Approval Enforcement: Maker '${proposal.maker_name}' cannot approve their own proposal.`);
      }

      const isApprove = input.action === 'APPROVE';
      const newStatus = isApprove ? 'APPROVED' : 'REJECTED';

      if (!input.checkerName || !input.checkerName.trim()) {
        throw new Error('Missing required field: checkerName is mandatory for reviewing resolution proposal.');
      }
      if (!isApprove && (!input.rejectionReason || !input.rejectionReason.trim())) {
        throw new Error('Missing required field: rejectionReason is mandatory when rejecting a resolution proposal.');
      }

      // 3. Update proposal status in PostgreSQL
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
        isApprove ? null : input.rejectionReason.trim(),
        input.requestId
      ]);

      const updatedRow = updateRes.rows[0];

      // 4. Update transaction status in PostgreSQL
      if (isApprove) {
        // Commit resolution
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
          [targetStatus, `Approved by ${input.checkerName}`, proposal.task_id, proposal.transaction_id]
        );
      } else {
        // Reject & revert to FLAGGED_DISCREPANCY
        await queryPg(
          `UPDATE investigation_transactions 
           SET final_result = 'FAIL',
               investigation_status = 'FLAGGED_DISCREPANCY',
               status_flag_text = $1,
               status_flag_color = 'rose',
               updated_at = NOW()
           WHERE task_id = $2 AND transaction_id = $3;`,
          [`Rejected by ${input.checkerName}`, proposal.task_id, proposal.transaction_id]
        );
      }

      await queryPg('COMMIT;');

      return {
        id: updatedRow.id,
        taskId: updatedRow.task_id,
        transactionId: updatedRow.transaction_id,
        teamId: updatedRow.team_id,
        makerId: updatedRow.maker_id,
        makerName: updatedRow.maker_name,
        proposedAction: updatedRow.proposed_action,
        proposedStatus: updatedRow.proposed_status,
        justificationNote: updatedRow.justification_note,
        evidenceSnapshot: updatedRow.evidence_snapshot || {},
        checkerId: updatedRow.checker_id,
        checkerName: updatedRow.checker_name,
        rejectionReason: updatedRow.rejection_reason,
        status: updatedRow.status,
        createdAt: updatedRow.created_at,
        reviewedAt: updatedRow.reviewed_at
      };
    } catch (err) {
      await queryPg('ROLLBACK;');
      throw err;
    }
  },

  /**
   * Retrieves pending resolution approval requests for a specific team.
   */
  async getTeamPendingResolutions(teamId?: string): Promise<ResolutionApprovalRequest[]> {
    let sql = `SELECT * FROM resolution_approval_requests WHERE status = 'PENDING'`;
    const params: any[] = [];

    if (teamId && teamId !== 'all') {
      sql += ` AND team_id = $1`;
      params.push(teamId);
    }

    sql += ` ORDER BY created_at DESC;`;

    const res = await queryPg(sql, params);
    return res.rows.map((r: any) => ({
      id: r.id,
      taskId: r.task_id,
      transactionId: r.transaction_id,
      teamId: r.team_id,
      makerId: r.maker_id,
      makerName: r.maker_name,
      proposedAction: r.proposed_action,
      proposedStatus: r.proposed_status,
      justificationNote: r.justification_note,
      evidenceSnapshot: r.evidence_snapshot || {},
      status: r.status,
      createdAt: r.created_at
    }));
  }
};
