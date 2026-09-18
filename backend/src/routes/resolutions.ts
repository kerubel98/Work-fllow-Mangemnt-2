import { Router } from 'express';
import { makerCheckerService } from '../services/makerCheckerService.js';

const router = Router();

/**
 * POST /api/resolutions/propose
 * Maker submits a resolution proposal.
 */
router.post('/propose', async (req, res) => {
  try {
    const proposal = await makerCheckerService.submitResolutionProposal(req.body);
    res.status(201).json(proposal);
  } catch (err: any) {
    res.status(400).json({ error: err.message || 'Failed to submit resolution proposal.' });
  }
});

/**
 * POST /api/resolutions/review
 * Checker approves or rejects a pending proposal (anti-self-approval enforced).
 */
router.post('/review', async (req, res) => {
  try {
    const result = await makerCheckerService.reviewResolutionProposal(req.body);
    res.status(200).json(result);
  } catch (err: any) {
    const isForbidden = err.message.includes('Anti-Self-Approval');
    res.status(isForbidden ? 403 : 400).json({ error: err.message || 'Failed to review resolution proposal.' });
  }
});

/**
 * GET /api/resolutions/pending
 * Retrieves pending proposals for a team.
 */
router.get('/pending', async (req, res) => {
  try {
    const teamId = (req.query.teamId as string) || undefined;
    const pending = await makerCheckerService.getTeamPendingResolutions(teamId);
    res.status(200).json(pending);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch pending resolutions.' });
  }
});

/**
 * POST /api/resolutions/propose-from-chat
 * Converts a team discussion chat message into a Maker-Checker proposal.
 */
router.post('/propose-from-chat', async (req, res) => {
  try {
    const { chatMessageId, messageContent, taskId, transactionId, teamId, makerId, makerName } = req.body;
    const proposal = await makerCheckerService.submitResolutionProposal({
      taskId: taskId || 'TASK-CHAT-REF',
      transactionId: transactionId || `TXN-CHAT-${Date.now()}`,
      teamId: teamId || 'default-team',
      makerId: makerId || 'usr-maker',
      makerName: makerName || 'Chat Maker',
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
