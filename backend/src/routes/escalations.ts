/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { escalationService } from '../services/escalationService.js';
import { postgresRepo } from '../store/postgresRepo.js';
import { EscalationLedgerEvent } from '../types.js';

export const escalationsRouter = Router();

// ================= BILATERAL ESCALATION AGREEMENTS (Domain 9, Screens 27-32) =================

// GET /api/escalations/agreements - List agreements
escalationsRouter.get('/agreements', async (req: Request, res: Response) => {
  try {
    const { issueId, teamId, status } = req.query as { issueId?: string; teamId?: string; status?: string };
    const agreements = await postgresRepo.getEscalationAgreements({ issueId, teamId, status });
    return res.json(agreements);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/escalations/agreements/:id - Get agreement by ID
escalationsRouter.get('/agreements/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const agreement = await postgresRepo.getEscalationAgreementById(id);
    if (!agreement) {
      return res.status(404).json({ error: 'Escalation agreement not found' });
    }
    return res.json(agreement);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/escalations/agreements - Create new escalation proposal (Screen 29)
escalationsRouter.post('/agreements', async (req: Request, res: Response) => {
  try {
    const {
      issueId, escalatingTeamId, receivingTeamId, priority, reason,
      workflowId, workflowName, flaggedCount, totalCount,
      raisedByUserId, raisedByUsername, kpis, payloadOptions
    } = req.body;

    if (!issueId || !escalatingTeamId || !receivingTeamId || !reason || !raisedByUserId) {
      return res.status(400).json({ error: 'issueId, escalatingTeamId, receivingTeamId, reason, and raisedByUserId are required' });
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const initialLedger: EscalationLedgerEvent[] = [
      {
        id: `ledg-${Date.now()}-1`,
        event: `Raised by @${raisedByUsername || 'operator'}`,
        actor: `@${raisedByUsername || 'operator'}`,
        timestamp: timeStr,
        type: 'raised',
        details: reason
      }
    ];

    const defaultKpis = kpis && kpis.length > 0 ? kpis : [
      { name: 'Time to first response', target: '4 hours', status: 'Running', progressPercent: 0 },
      { name: 'Resolution target', target: '24 hours', status: 'Running', progressPercent: 0 },
      { name: 'Accuracy of fixes', target: '99%', status: 'Not measured', progressPercent: 0 }
    ];

    const created = await postgresRepo.createEscalationAgreement({
      issueId,
      escalatingTeamId,
      receivingTeamId,
      status: 'AWAITING_ESCALATING_SIGNATURE',
      priority: priority || 'High',
      reason,
      workflowId,
      workflowName,
      flaggedCount: flaggedCount || 24,
      totalCount: totalCount || 500,
      raisedByUserId,
      raisedByUsername: raisedByUsername || 'Operator',
      kpis: defaultKpis,
      payloadOptions: payloadOptions || { sendSummary: true, sendWorkflow: true, sendFlaggedRows: true, sendChatHistory: false },
      ledger: initialLedger
    });

    // Also update issue with escalation metadata
    await postgresRepo.updateIssue(issueId, {
      escalatedToTeamId: receivingTeamId,
      escalationReason: reason,
      escalatedAt: now.toISOString()
    });

    return res.status(201).json(created);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/escalations/agreements/:id/sign-escalating - Escalating lead signs & assigns checker (Screen 30)
escalationsRouter.post('/agreements/:id/sign-escalating', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { leadId, signature, checkerId, checkerName } = req.body;

    const agreement = await postgresRepo.getEscalationAgreementById(id);
    if (!agreement) return res.status(404).json({ error: 'Agreement not found' });

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const updatedLedger: EscalationLedgerEvent[] = [
      ...agreement.ledger,
      {
        id: `ledg-${Date.now()}-2`,
        event: `Signed by @${signature || 'lead'}, checker @${checkerName || 'checker'} assigned`,
        actor: `@${signature || 'lead'}`,
        timestamp: timeStr,
        type: 'signed',
        details: `Assigned checker: ${checkerName || checkerId}`
      }
    ];

    const updated = await postgresRepo.updateEscalationAgreement(id, {
      status: 'AWAITING_RECEIVING_ACCEPTANCE',
      escalatingLeadId: leadId,
      escalatingLeadSignature: signature,
      escalatingSignedAt: now.toISOString(),
      assignedCheckerId: checkerId,
      assignedCheckerName: checkerName,
      ledger: updatedLedger
    });

    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/escalations/agreements/:id/accept-receiving - Receiving lead accepts, assigns technician & starts clock (Screen 31)
escalationsRouter.post('/agreements/:id/accept-receiving', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { leadId, signature, technicianId, technicianName } = req.body;

    const agreement = await postgresRepo.getEscalationAgreementById(id);
    if (!agreement) return res.status(404).json({ error: 'Agreement not found' });

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const updatedLedger: EscalationLedgerEvent[] = [
      ...agreement.ledger,
      {
        id: `ledg-${Date.now()}-3`,
        event: `Accepted by @${signature || 'lead'}, technician @${technicianName || 'tech'} assigned`,
        actor: `@${signature || 'lead'}`,
        timestamp: timeStr,
        type: 'accepted',
        details: `Assigned technician: ${technicianName || technicianId}`
      }
    ];

    // Clock starts strictly upon acceptance (Governance Rule)
    const updated = await postgresRepo.updateEscalationAgreement(id, {
      status: 'ACTIVE',
      receivingLeadId: leadId,
      receivingLeadSignature: signature,
      receivingAcceptedAt: now.toISOString(),
      assignedTechnicianId: technicianId,
      assignedTechnicianName: technicianName,
      clockStartedAt: now.toISOString(),
      ledger: updatedLedger
    });

    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/escalations/agreements/:id/decline-receiving - Receiving lead declines
escalationsRouter.post('/agreements/:id/decline-receiving', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { leadId, reason } = req.body;

    const agreement = await postgresRepo.getEscalationAgreementById(id);
    if (!agreement) return res.status(404).json({ error: 'Agreement not found' });

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const updatedLedger: EscalationLedgerEvent[] = [
      ...agreement.ledger,
      {
        id: `ledg-${Date.now()}-decl`,
        event: `Declined by receiving lead: ${reason || 'Capacity constraint'}`,
        actor: leadId || 'lead',
        timestamp: timeStr,
        type: 'closed',
        details: reason
      }
    ];

    const updated = await postgresRepo.updateEscalationAgreement(id, {
      status: 'DECLINED',
      ledger: updatedLedger
    });

    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/escalations/agreements/:id/ledger-event - Append immutable event/message
escalationsRouter.post('/agreements/:id/ledger-event', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { event, actor, type, details } = req.body;

    const agreement = await postgresRepo.getEscalationAgreementById(id);
    if (!agreement) return res.status(404).json({ error: 'Agreement not found' });

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const updatedLedger: EscalationLedgerEvent[] = [
      ...agreement.ledger,
      {
        id: `ledg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        event: event || 'Room update',
        actor: actor || 'system',
        timestamp: timeStr,
        type: (type as EscalationLedgerEvent['type']) || 'message',
        details
      }
    ];

    const updated = await postgresRepo.updateEscalationAgreement(id, {
      ledger: updatedLedger
    });

    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/escalations/agreements/:id/close - Close case from agreement view (Screen 32)
escalationsRouter.patch('/agreements/:id/close', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { closedBy } = req.body;

    const agreement = await postgresRepo.getEscalationAgreementById(id);
    if (!agreement) return res.status(404).json({ error: 'Agreement not found' });

    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const updatedLedger: EscalationLedgerEvent[] = [
      ...agreement.ledger,
      {
        id: `ledg-${Date.now()}-close`,
        event: `Case closed under agreement by ${closedBy || 'lead'}`,
        actor: closedBy || 'lead',
        timestamp: timeStr,
        type: 'closed'
      }
    ];

    const updated = await postgresRepo.updateEscalationAgreement(id, {
      status: 'CLOSED',
      ledger: updatedLedger
    });

    if (agreement.issueId) {
      await postgresRepo.updateIssue(agreement.issueId, { status: 'Closed' });
    }

    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// ================= EXISTING ESCALATION EVENTS & COMMANDS =================

// GET /api/escalations/issue/:issueId - List escalation history for an issue room
escalationsRouter.get('/issue/:issueId', async (req: Request, res: Response) => {
  try {
    const { issueId } = req.params;
    const events = await escalationService.getEscalationsForIssue(issueId);
    return res.json(events);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/escalations/command - Execute structured operational command
escalationsRouter.post('/command', async (req: Request, res: Response) => {
  try {
    const { issueId, actionType, targetTeamId, reason, actorId, actorName, idempotencyKey, payload } = req.body;

    if (!issueId || !actionType || !actorId) {
      return res.status(400).json({ error: 'issueId, actionType, and actorId are required.' });
    }

    const result = await escalationService.executeActionCommand({
      issueId,
      actionType,
      targetTeamId,
      reason,
      actorId,
      actorName: actorName || 'Operator',
      idempotencyKey,
      payload
    });

    if (result.duplicateSuppressed) {
      return res.status(409).json(result);
    }

    return res.status(201).json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /api/escalations/:id/status - Transition escalation lifecycle state
escalationsRouter.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required.' });
    }

    const updated = await escalationService.transitionStatus(id, status);
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
