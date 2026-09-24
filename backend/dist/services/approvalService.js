/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { queryPg } from '../config/postgres.js';
import { postgresRepo } from '../store/postgresRepo.js';
import { eventService } from './events.js';
import { workflowBundleService } from './workflowBundleService.js';
export const approvalService = {
    /**
     * Fetches unified approvals matching given filters.
     */
    async getApprovals(filters) {
        const results = [];
        const includeTxn = !filters.type || filters.type === 'ALL' || filters.type === 'TRANSACTION';
        const includeBundle = !filters.type || filters.type === 'ALL' || filters.type === 'WORKFLOW_BUNDLE';
        const includeSetting = !filters.type || filters.type === 'ALL' || filters.type === 'SETTING';
        // 1. Transaction resolutions (Strict Financial Governance)
        if (includeTxn) {
            try {
                let sql = `SELECT * FROM resolution_approval_requests WHERE 1=1`;
                const params = [];
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
                    results.push({
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
                    });
                });
            }
            catch (err) {
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
                    let normalizedStatus = 'PENDING';
                    if (b.status === 'APPROVED')
                        normalizedStatus = 'APPROVED';
                    else if (b.status === 'REJECTED')
                        normalizedStatus = 'REJECTED';
                    results.push({
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
                    });
                });
            }
            catch (err) {
                console.warn('[approvalService] Error querying workflow_bundles:', err.message);
            }
        }
        // 3. Workspace setting proposals (Legacy/Fallback)
        if (includeSetting) {
            try {
                const proposals = await postgresRepo.getWorkspaceSettingProposals(filters.teamId, filters.status ? filters.status : undefined);
                proposals.forEach(p => {
                    if (filters.makerId && p.makerId !== filters.makerId)
                        return;
                    let normalizedStatus = 'PENDING';
                    if (p.status === 'APPROVED')
                        normalizedStatus = 'APPROVED';
                    else if (p.status === 'REJECTED')
                        normalizedStatus = 'REJECTED';
                    else if (p.status === 'ESCALATED_TO_TARGET_TEAM')
                        normalizedStatus = 'ESCALATED';
                    results.push({
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
                    });
                });
            }
            catch (err) {
                console.warn('[approvalService] Error querying workspace setting proposals:', err.message);
            }
        }
        // Sort combined feed by createdAt DESC
        return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    /**
     * Dedicated domain query for financial transaction resolutions.
     */
    async getTransactionApprovals(filters) {
        return this.getApprovals({ ...filters, type: 'TRANSACTION' });
    },
    /**
     * Dedicated domain query for composite workflow bundles.
     */
    async getWorkflowBundleApprovals(filters) {
        return this.getApprovals({ ...filters, type: 'WORKFLOW_BUNDLE' });
    },
    /**
     * Fetches a single approval item by ID.
     */
    async getApprovalById(id) {
        // Check resolution requests first
        try {
            const res = await queryPg(`SELECT * FROM resolution_approval_requests WHERE id = $1`, [id]);
            if (res.rows.length > 0) {
                const r = res.rows[0];
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
        }
        catch {
            // Ignore and check setting proposals
        }
        try {
            const p = await postgresRepo.getWorkspaceSettingProposalById(id);
            if (p) {
                let normalizedStatus = 'PENDING';
                if (p.status === 'APPROVED')
                    normalizedStatus = 'APPROVED';
                else if (p.status === 'REJECTED')
                    normalizedStatus = 'REJECTED';
                else if (p.status === 'ESCALATED_TO_TARGET_TEAM')
                    normalizedStatus = 'ESCALATED';
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
        }
        catch {
            // Ignore
        }
        // Check workflow bundles
        try {
            const b = await workflowBundleService.getBundleById(id);
            if (b) {
                let normalizedStatus = 'PENDING';
                if (b.status === 'APPROVED')
                    normalizedStatus = 'APPROVED';
                else if (b.status === 'REJECTED')
                    normalizedStatus = 'REJECTED';
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
        }
        catch {
            // Ignore
        }
        return null;
    },
    /**
     * Submits a Maker proposal.
     */
    async submitProposal(input) {
        if (!input.makerId || !input.justification) {
            throw new Error('Maker ID and justification are required to submit an approval proposal.');
        }
        const nowIso = new Date().toISOString();
        if (input.type === 'TRANSACTION_RESOLUTION') {
            if (!input.taskId || !input.transactionId) {
                throw new Error('Transaction resolutions require taskId and transactionId.');
            }
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
                input.teamId || 'default-team',
                input.makerId,
                input.makerName || 'Maker Operator',
                input.proposedAction || 'FORCE_MATCH',
                input.proposedStatus || 'VERIFIED_MATCH',
                input.justification,
                snapshotJson,
                nowIso
            ]);
            const row = res.rows[0];
            // Lock transaction status in PostgreSQL
            try {
                await queryPg(`UPDATE investigation_transactions 
           SET investigation_status = 'PENDING_CHECKER_REVIEW',
               status_flag_text = 'Pending Checker Approval',
               status_flag_color = 'amber',
               updated_at = NOW()
           WHERE task_id = $1 AND transaction_id = $2;`, [input.taskId, input.transactionId]);
            }
            catch (err) {
                console.warn(`[approvalService] Could not lock transaction status: ${err.message}`);
            }
            const item = {
                id: row.id,
                type: 'TRANSACTION_RESOLUTION',
                title: `Resolution: ${row.proposed_action} on ${row.transaction_id}`,
                description: row.justification_note,
                makerId: row.maker_id,
                makerName: row.maker_name,
                teamId: row.team_id,
                status: 'PENDING',
                evidenceSnapshot: row.evidence_snapshot || {},
                proposedChanges: {
                    taskId: row.task_id,
                    transactionId: row.transaction_id,
                    proposedAction: row.proposed_action,
                    proposedStatus: row.proposed_status
                },
                createdAt: row.created_at
            };
            eventService.broadcastEvent('approval_proposal:created', item);
            return item;
        }
        else if (input.type === 'WORKFLOW_BUNDLE') {
            if (!input.bundleId) {
                throw new Error('bundleId is required to propose a workflow bundle promotion.');
            }
            const bundle = await workflowBundleService.proposePromotion(input.bundleId, input.targetScope || 'TEAM', input.makerId, input.makerName || input.makerId);
            const item = {
                id: bundle.id,
                type: 'WORKFLOW_BUNDLE',
                title: `Workflow Bundle: ${bundle.name} (${bundle.bundleCode})`,
                description: input.justification,
                makerId: bundle.makerId,
                makerName: bundle.makerName,
                teamId: bundle.sourceTeamId,
                teamName: bundle.sourceTeamName,
                status: 'PENDING',
                evidenceSnapshot: bundle.evidenceSnapshot || {},
                proposedChanges: {
                    bundleId: bundle.id,
                    bundleCode: bundle.bundleCode,
                    workflowId: bundle.workflowId,
                    version: bundle.version,
                    scope: bundle.scope
                },
                createdAt: bundle.updatedAt
            };
            eventService.broadcastEvent('approval_proposal:created', item);
            return item;
        }
        else {
            // Workspace setting proposal (Legacy fallback)
            const propId = `prop-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
            const proposal = await postgresRepo.createWorkspaceSettingProposal({
                id: propId,
                settingType: input.settingType || 'WORKSPACE_CONFIG',
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
                    await queryPg(`UPDATE workspace_setting_proposals SET evidence_snapshot = $1::jsonb WHERE id = $2`, [JSON.stringify(input.evidenceSnapshot), proposal.id]);
                }
                catch {
                    // Non-blocking
                }
            }
            const item = {
                id: proposal.id,
                type: 'WORKSPACE_SETTING',
                title: proposal.title,
                description: proposal.justification,
                makerId: proposal.makerId,
                makerName: proposal.makerName,
                teamId: proposal.teamId,
                teamName: proposal.teamName,
                status: 'PENDING',
                evidenceSnapshot: input.evidenceSnapshot || {},
                proposedChanges: proposal.proposedChanges,
                currentSnapshot: proposal.currentSnapshot,
                createdAt: proposal.createdAt
            };
            eventService.broadcastEvent('approval_proposal:created', item);
            return item;
        }
    },
    /**
     * Reviews a proposal (Checker).
     * Enforces Anti-Self-Approval (makerId !== checkerId).
     */
    async reviewProposal(input) {
        if (!input.id || !input.checkerId || !input.action) {
            throw new Error('Proposal ID, Checker ID, and Action (APPROVE/REJECT) are required.');
        }
        // Try workflow bundle review first if ID indicates a bundle
        if (input.id.startsWith('bundle-')) {
            const bundle = await workflowBundleService.reviewPromotion(input.id, input.checkerId, input.checkerName || 'Checker Supervisor', input.action, input.reason);
            const item = {
                id: bundle.id,
                type: 'WORKFLOW_BUNDLE',
                title: `Workflow Bundle: ${bundle.name} (${bundle.bundleCode})`,
                description: bundle.description || '',
                makerId: bundle.makerId,
                makerName: bundle.makerName,
                teamId: bundle.sourceTeamId,
                teamName: bundle.sourceTeamName,
                status: bundle.status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
                evidenceSnapshot: bundle.evidenceSnapshot || {},
                proposedChanges: {
                    bundleId: bundle.id,
                    bundleCode: bundle.bundleCode,
                    workflowId: bundle.workflowId,
                    version: bundle.version,
                    scope: bundle.scope
                },
                checkerId: bundle.checkerId,
                checkerName: bundle.checkerName,
                reviewedAt: bundle.approvedAt,
                rejectionReason: bundle.checkerFeedback,
                createdAt: bundle.createdAt
            };
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
                    input.checkerName || 'Checker Supervisor',
                    isApprove ? null : (input.reason || 'Rejected by supervisor'),
                    input.id
                ]);
                const updatedRow = updateRes.rows[0];
                // Update transaction status in PostgreSQL
                if (isApprove) {
                    const targetStatus = proposal.proposed_status || 'VERIFIED_MATCH';
                    await queryPg(`UPDATE investigation_transactions 
             SET final_result = 'PASS',
                 final_action = 'CLOSE',
                 investigation_status = $1,
                 status_flag_text = $2,
                 status_flag_color = 'emerald',
                 updated_at = NOW()
             WHERE task_id = $3 AND transaction_id = $4;`, [targetStatus, `Approved by ${input.checkerName}`, proposal.task_id, proposal.transaction_id]);
                }
                else {
                    await queryPg(`UPDATE investigation_transactions 
             SET final_result = 'FAIL',
                 investigation_status = 'FLAGGED_DISCREPANCY',
                 status_flag_text = $1,
                 status_flag_color = 'rose',
                 updated_at = NOW()
             WHERE task_id = $2 AND transaction_id = $3;`, [`Rejected: ${input.reason || 'Supervisor Rejected'}`, proposal.task_id, proposal.transaction_id]);
                }
                await queryPg('COMMIT;');
                const item = {
                    id: updatedRow.id,
                    type: 'TRANSACTION_RESOLUTION',
                    title: `Resolution: ${updatedRow.proposed_action} on ${updatedRow.transaction_id}`,
                    description: updatedRow.justification_note,
                    makerId: updatedRow.maker_id,
                    makerName: updatedRow.maker_name,
                    teamId: updatedRow.team_id,
                    status: newStatus,
                    evidenceSnapshot: updatedRow.evidence_snapshot || {},
                    proposedChanges: {
                        taskId: updatedRow.task_id,
                        transactionId: updatedRow.transaction_id,
                        proposedAction: updatedRow.proposed_action,
                        proposedStatus: updatedRow.proposed_status
                    },
                    checkerId: updatedRow.checker_id,
                    checkerName: updatedRow.checker_name,
                    reviewedAt: updatedRow.reviewed_at,
                    rejectionReason: updatedRow.rejection_reason,
                    createdAt: updatedRow.created_at
                };
                eventService.broadcastEvent('approval_proposal:reviewed', item);
                return item;
            }
            catch (err) {
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
        const updatedSetting = await postgresRepo.reviewWorkspaceSettingProposal(input.id, input.checkerId, input.checkerName || 'Checker Supervisor', input.action, input.reason);
        const item = {
            id: updatedSetting.id,
            type: 'WORKSPACE_SETTING',
            title: updatedSetting.title,
            description: updatedSetting.justification,
            makerId: updatedSetting.makerId,
            makerName: updatedSetting.makerName,
            teamId: updatedSetting.teamId,
            teamName: updatedSetting.teamName,
            status: updatedSetting.status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
            evidenceSnapshot: updatedSetting.evidenceSnapshot || updatedSetting.evidence_snapshot || {},
            proposedChanges: updatedSetting.proposedChanges,
            currentSnapshot: updatedSetting.currentSnapshot,
            checkerId: updatedSetting.checkerId || updatedSetting.reviewedBy,
            checkerName: updatedSetting.checkerName || updatedSetting.reviewerName,
            reviewedAt: updatedSetting.appliedAt || updatedSetting.reviewedAt || new Date().toISOString(),
            rejectionReason: updatedSetting.checkerFeedback || updatedSetting.reviewFeedback,
            createdAt: updatedSetting.createdAt
        };
        eventService.broadcastEvent('approval_proposal:reviewed', item);
        return item;
    },
    /**
     * Escalates a proposal to a target team.
     */
    async escalateProposal(input) {
        if (!input.id || !input.targetTeamId || !input.reason) {
            throw new Error('Proposal ID, target team ID, and reason are required to escalate.');
        }
        const updated = await postgresRepo.escalateWorkspaceSettingProposal(input.id, input.targetTeamId, input.reason, input.escalatedById, input.escalatedByName);
        const item = {
            id: updated.id,
            type: 'WORKSPACE_SETTING',
            title: updated.title,
            description: updated.justification,
            makerId: updated.makerId,
            makerName: updated.makerName,
            teamId: updated.teamId,
            teamName: updated.teamName,
            status: 'ESCALATED',
            evidenceSnapshot: updated.evidenceSnapshot || {},
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
