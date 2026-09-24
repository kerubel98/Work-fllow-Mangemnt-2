/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { approvalService } from '../services/approvalService.js';

export const approvalsRouter = Router();

// GET /api/approvals - List unified proposals
approvalsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { status, teamId, makerId, type } = req.query;
    const items = await approvalService.getApprovals({
      status: status as string,
      teamId: teamId as string,
      makerId: makerId as string,
      type: type as any
    });
    return res.json(items);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/approvals/transactions - Dedicated domain feed for financial overrides
approvalsRouter.get('/transactions', async (req: Request, res: Response) => {
  try {
    const { status, teamId, makerId } = req.query;
    const items = await approvalService.getTransactionApprovals({
      status: status as string,
      teamId: teamId as string,
      makerId: makerId as string
    });
    return res.json(items);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/approvals/workflow-bundles - Dedicated domain feed for workflow bundles
approvalsRouter.get('/workflow-bundles', async (req: Request, res: Response) => {
  try {
    const { status, teamId, makerId } = req.query;
    const items = await approvalService.getWorkflowBundleApprovals({
      status: status as string,
      teamId: teamId as string,
      makerId: makerId as string
    });
    return res.json(items);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/approvals/:id - Get proposal details
approvalsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const item = await approvalService.getApprovalById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: `Approval item '${req.params.id}' not found.` });
    }
    return res.json(item);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/approvals/propose - Submit Maker proposal
approvalsRouter.post('/propose', async (req: Request, res: Response) => {
  try {
    const created = await approvalService.submitProposal(req.body);
    return res.status(201).json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/approvals/transactions/:id/approve - Approve financial transaction override
approvalsRouter.post('/transactions/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { checkerId, checkerName, checkerTeamId, reason } = req.body;
    if (!checkerId) {
      return res.status(400).json({ error: 'checkerId is required.' });
    }
    const reviewed = await approvalService.reviewProposal({
      id,
      checkerId,
      checkerName: checkerName || 'Checker Supervisor',
      checkerTeamId,
      action: 'APPROVE',
      reason
    });
    return res.json(reviewed);
  } catch (err: any) {
    if (err.message && err.message.includes('Anti-Self-Approval')) {
      return res.status(403).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/approvals/transactions/:id/reject - Reject financial transaction override
approvalsRouter.post('/transactions/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { checkerId, checkerName, checkerTeamId, reason } = req.body;
    if (!checkerId) {
      return res.status(400).json({ error: 'checkerId is required.' });
    }
    const reviewed = await approvalService.reviewProposal({
      id,
      checkerId,
      checkerName: checkerName || 'Checker Supervisor',
      checkerTeamId,
      action: 'REJECT',
      reason
    });
    return res.json(reviewed);
  } catch (err: any) {
    if (err.message && err.message.includes('Anti-Self-Approval')) {
      return res.status(403).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/approvals/:id/review - Checker Review (APPROVE / REJECT)
approvalsRouter.post('/:id/review', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { checkerId, checkerName, checkerTeamId, action, reason } = req.body;

    if (!checkerId || !action) {
      return res.status(400).json({ error: 'checkerId and action (APPROVE/REJECT) are required.' });
    }

    const reviewed = await approvalService.reviewProposal({
      id,
      checkerId,
      checkerName: checkerName || 'Checker Supervisor',
      checkerTeamId,
      action: action as 'APPROVE' | 'REJECT',
      reason
    });

    return res.json(reviewed);
  } catch (err: any) {
    if (err.message && err.message.includes('Anti-Self-Approval')) {
      return res.status(403).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/approvals/:id/escalate - Escalate to Target Team
approvalsRouter.post('/:id/escalate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { targetTeamId, reason, escalatedById, escalatedByName } = req.body;

    if (!targetTeamId || !reason) {
      return res.status(400).json({ error: 'targetTeamId and reason are required.' });
    }

    const escalated = await approvalService.escalateProposal({
      id,
      targetTeamId,
      reason,
      escalatedById: escalatedById || 'system',
      escalatedByName: escalatedByName || 'Operator'
    });

    return res.json(escalated);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});
