import { Router, Request, Response } from 'express';
import { postgresRepo } from '../store/postgresRepo.js';
import { eventService } from '../services/events.js';
import { WorkspaceSettingProposal, SettingProposalType } from '../types.js';

export const workspaceSettingsProposalsRouter = Router();

// GET /api/settings/proposals - List proposals
workspaceSettingsProposalsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const teamId = req.query.teamId as string | undefined;
    const status = req.query.status as string | undefined;
    const escalatedTeamId = req.query.escalatedTeamId as string | undefined;

    const proposals = await postgresRepo.getWorkspaceSettingProposals(teamId, status, escalatedTeamId);
    return res.json(proposals);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/proposals/:id - Get proposal by ID
workspaceSettingsProposalsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const proposal = await postgresRepo.getWorkspaceSettingProposalById(req.params.id);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    return res.json(proposal);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/proposals - Propose a new setting change (Maker)
workspaceSettingsProposalsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      settingType,
      settingKey,
      title,
      proposedChanges,
      currentSnapshot,
      justification,
      makerId,
      makerName,
      teamId
    } = req.body;

    if (!settingType || !settingKey || !title || !proposedChanges || !justification || !makerId || !teamId) {
      return res.status(400).json({
        error: 'settingType, settingKey, title, proposedChanges, justification, makerId, and teamId are required.'
      });
    }

    const proposal: WorkspaceSettingProposal = {
      id: `prop-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      settingType: settingType as SettingProposalType,
      settingKey,
      title,
      proposedChanges,
      currentSnapshot,
      justification,
      makerId,
      makerName: makerName || makerId,
      teamId,
      status: 'PENDING_TEAM_APPROVAL',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const saved = await postgresRepo.createWorkspaceSettingProposal(proposal);
    eventService.broadcastEvent('setting_proposal:created', saved);
    return res.status(201).json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/proposals/:id/review - Checker Review (Approve / Reject)
workspaceSettingsProposalsRouter.post('/:id/review', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { checkerId, checkerName, action, feedback } = req.body;

    if (!checkerId || !action) {
      return res.status(400).json({ error: 'checkerId and action (APPROVE/REJECT) are required.' });
    }

    const existing = await postgresRepo.getWorkspaceSettingProposalById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Setting proposal not found.' });
    }

    // Anti-Self-Approval Enforcement (Four-Eyes Principle)
    if (existing.makerId === checkerId) {
      return res.status(403).json({
        error: `Anti-Self-Approval Violation: Maker '${existing.makerName}' cannot approve their own setting proposal.`
      });
    }

    const updated = await postgresRepo.reviewWorkspaceSettingProposal(
      id,
      checkerId,
      checkerName || 'Checker Lead',
      action as 'APPROVE' | 'REJECT',
      feedback
    );

    eventService.broadcastEvent('setting_proposal:reviewed', updated);
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/proposals/:id/escalate - Escalate to Target Team in Escalation Matrix
workspaceSettingsProposalsRouter.post('/:id/escalate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { targetTeamId, reason, escalatedById, escalatedByName } = req.body;

    if (!targetTeamId || !reason) {
      return res.status(400).json({ error: 'targetTeamId and reason are required for escalation.' });
    }

    const updated = await postgresRepo.escalateWorkspaceSettingProposal(
      id,
      targetTeamId,
      reason,
      escalatedById || 'system',
      escalatedByName || 'Operator'
    );

    eventService.broadcastEvent('setting_proposal:escalated', updated);
    return res.json(updated);
  } catch (err: any) {
    if (err.message && err.message.includes('Escalation Matrix Violation')) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message });
  }
});
