/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { workflowBundleService } from '../services/workflowBundleService.js';

export const workflowBundlesRouter = Router();

// GET /api/workflow-bundles - List bundles
workflowBundlesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { teamId, scope, status, makerId } = req.query;
    const bundles = await workflowBundleService.getBundles({
      teamId: teamId as string,
      scope: scope as string,
      status: status as string,
      makerId: makerId as string
    });
    return res.json(bundles);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/workflow-bundles/:id - Get single bundle with evidence snapshot
workflowBundlesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const bundle = await workflowBundleService.getBundleById(req.params.id);
    if (!bundle) {
      return res.status(404).json({ error: `Workflow bundle '${req.params.id}' not found.` });
    }
    return res.json(bundle);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/workflow-bundles - Create composite workflow bundle (Maker)
workflowBundlesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {
      name,
      description,
      version,
      scope,
      workflowId,
      validationBoxIds,
      dbCheckIds,
      sourceTeamId,
      makerId,
      makerName,
      hashtagBindings
    } = req.body;

    if (!name || !workflowId || !sourceTeamId || !makerId) {
      return res.status(400).json({
        error: 'name, workflowId, sourceTeamId, and makerId are required.'
      });
    }

    const created = await workflowBundleService.createBundle({
      name,
      description,
      version,
      scope,
      workflowId,
      validationBoxIds,
      dbCheckIds,
      sourceTeamId,
      makerId,
      makerName: makerName || makerId,
      hashtagBindings
    });

    return res.status(201).json(created);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/workflow-bundles/:id/propose - Propose bundle promotion
workflowBundlesRouter.post('/:id/propose', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { targetScope, makerId, makerName } = req.body;

    if (!targetScope || !makerId) {
      return res.status(400).json({ error: 'targetScope and makerId are required.' });
    }

    const proposed = await workflowBundleService.proposePromotion(
      id,
      targetScope,
      makerId,
      makerName || makerId
    );

    return res.json(proposed);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// POST /api/workflow-bundles/:id/review - Review promotion (Checker Dual Authorization)
workflowBundlesRouter.post('/:id/review', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { checkerId: bodyCheckerId, checkerName: bodyCheckerName, action, feedback } = req.body;

    // Enforce JWT caller identity (AUD-WFS-004: Anti-Self-Approval bypass prevention)
    const user = (req as any).user;
    const authenticatedUserId = user?.id || user?.sub;
    const effectiveCheckerId = authenticatedUserId || bodyCheckerId;
    const effectiveCheckerName = user?.name || user?.username || bodyCheckerName || 'Checker Supervisor';

    if (authenticatedUserId && bodyCheckerId && bodyCheckerId !== authenticatedUserId) {
      return res.status(403).json({
        error: 'Forbidden: You cannot review promotions under another user identity (checkerId spoofing prevented).'
      });
    }

    if (!effectiveCheckerId || !action) {
      return res.status(400).json({ error: 'checkerId and action (APPROVE/REJECT) are required.' });
    }

    const reviewed = await workflowBundleService.reviewPromotion(
      id,
      effectiveCheckerId,
      effectiveCheckerName,
      action,
      feedback
    );

    return res.json(reviewed);
  } catch (err: any) {
    if (err.message && err.message.includes('Anti-Self-Approval')) {
      return res.status(403).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message });
  }
});
