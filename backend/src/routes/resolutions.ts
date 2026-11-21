import { Router } from 'express';
import { makerCheckerService } from '../services/makerCheckerService.js';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/resolutions/propose
 * Maker submits a resolution proposal.
 */
router.post('/propose', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (req.body.makerId && req.body.makerId !== req.user!.id) {
      return res.status(400).json({ error: 'Security Violation: makerId in request body does not match authenticated token.' });
    }

    const proposalData = {
      ...req.body,
      makerId: req.user!.id,
      makerName: req.user!.username || req.user!.email || 'Maker'
    };
    const proposal = await makerCheckerService.submitResolutionProposal(proposalData);
    res.status(201).json(proposal);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to submit resolution proposal.' });
  }
});

/**
 * POST /api/resolutions/review
 * Checker approves or rejects a pending proposal (anti-self-approval enforced).
 */
router.post('/review', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    if (req.body.checkerId && req.body.checkerId !== req.user!.id) {
      return res.status(400).json({ error: 'Security Violation: checkerId in request body does not match authenticated token.' });
    }

    const reviewData = {
      ...req.body,
      checkerId: req.user!.id,
      checkerName: req.user!.username || req.user!.email || 'Checker'
    };
    const result = await makerCheckerService.reviewResolutionProposal(reviewData);
    res.status(200).json(result);
  } catch (err: any) {
    const isForbidden = err.message.includes('Anti-Self-Approval') || err.message.includes('Authorization Failure');
    res.status(isForbidden ? 403 : 400).json({ error: err.message || 'Failed to review resolution proposal.' });
  }
});

/**
 * GET /api/resolutions/pending
 * Retrieves pending proposals for a team.
 */
router.get('/pending', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const teamId = (req.query.teamId as string) || undefined;
    const limit = Math.max(1, Math.min(parseInt(req.query.limit as string || '100', 10) || 100, 500));
    const offset = Math.max(0, parseInt(req.query.offset as string || '0', 10) || 0);
    const pending = await makerCheckerService.getTeamPendingResolutions(teamId, limit, offset);
    res.status(200).json(pending);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch pending resolutions.' });
  }
});

/**
 * POST /api/resolutions/propose-from-chat
 * Converts a team discussion chat message into a Maker-Checker proposal.
 */
router.post('/propose-from-chat', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { chatMessageId, messageContent, taskId, transactionId, teamId } = req.body;
    const proposal = await makerCheckerService.submitResolutionProposal({
      taskId: taskId || 'TASK-CHAT-REF',
      transactionId: transactionId || `TXN-CHAT-${Date.now()}`,
      teamId: teamId || 'default-team',
      makerId: req.user!.id,
      makerName: req.user!.username || 'Chat Maker',
      proposedAction: 'CHAT_RESOLUTION_PROPOSAL',
      proposedStatus: 'VERIFIED_MATCH',
      justificationNote: `Submitted from Chat (Message ID: ${chatMessageId || 'N/A'}): "${messageContent || ''}"`,
      evidenceSnapshot: { chatMessageId, messageContent }
    });

    res.status(201).json(proposal);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to submit proposal from chat.' });
  }
});

export default router;
