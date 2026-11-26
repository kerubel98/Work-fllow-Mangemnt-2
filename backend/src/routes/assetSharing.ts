import { Router, Request, Response } from 'express';
import { assetSharingService, AssetType, ShareTargetType } from '../services/assetSharingService.js';
import { assetVerificationService } from '../services/assetVerificationService.js';
import { getVerifiedActor } from '../utils/auth.js';

export const assetSharingRouter = Router();

/**
 * POST /api/assets/share
 * Shares an operational asset with an Individual or Team.
 */
assetSharingRouter.post('/share', async (req: Request, res: Response) => {
  try {
    const { assetType, assetId, targetType, targetId, targetName, message } = req.body;
    const actor = getVerifiedActor(req);

    if (!actor.id || actor.id === 'system') {
      return res.status(401).json({ error: 'Authentication required to share operational assets.' });
    }

    if (!assetType || !assetId || !targetType || !targetId) {
      return res.status(400).json({ error: 'Missing required parameters: assetType, assetId, targetType, targetId' });
    }

    const shareRecord = await assetSharingService.shareAsset({
      assetType: assetType as AssetType,
      assetId,
      senderId: actor.id,
      senderName: actor.name || actor.username || 'Operator',
      senderTeamId: actor.teamId || (req.headers['x-team-id'] as string),
      senderRole: actor.role,
      targetType: targetType as ShareTargetType,
      targetId,
      targetName,
      message
    });

    return res.status(201).json({
      success: true,
      message: `Asset successfully shared with ${targetType.toLowerCase()}`,
      share: shareRecord
    });
  } catch (err: any) {
    console.error('Error sharing asset:', err);
    const status = err.message?.includes('Access Denied') ? 403 : 500;
    return res.status(status).json({ error: err.message || 'Failed to share operational asset' });
  }
});

/**
 * POST /api/assets/:type/:id/adopt
 * 1-Click Adoption ("Add to My Workspace").
 */
assetSharingRouter.post('/:type/:id/adopt', async (req: Request, res: Response) => {
  try {
    const assetType = req.params.type.toUpperCase() as AssetType;
    const assetId = req.params.id;
    const user = (req as any).user || (req.headers['x-user-id'] ? {
      id: req.headers['x-user-id'] as string,
      name: (req.headers['x-user-name'] as string) || 'Operator'
    } : null);

    if (!user) {
      return res.status(401).json({ error: 'Authentication required to adopt assets.' });
    }

    const result = await assetSharingService.adoptAsset({
      assetType,
      assetId,
      recipientId: user.id,
      recipientName: user.name || user.username || 'Operator',
      customName: req.body.customName
    });

    return res.status(201).json({
      success: true,
      message: result.message,
      newAssetId: result.newAssetId,
      asset: result.asset
    });
  } catch (err: any) {
    console.error('Error adopting asset:', err);
    return res.status(500).json({ error: err.message || 'Failed to adopt asset to workspace' });
  }
});

/**
 * POST /api/assets/:type/:id/test
 * Hands-On Checker Testing: Runs the asset against sample transaction data.
 */
assetSharingRouter.post('/:type/:id/test', async (req: Request, res: Response) => {
  try {
    const assetType = req.params.type.toUpperCase() as AssetType;
    const assetId = req.params.id;
    const user = (req as any).user || (req.headers['x-user-id'] ? {
      id: req.headers['x-user-id'] as string,
      name: (req.headers['x-user-name'] as string) || 'Checker'
    } : null);

    if (!user) {
      return res.status(401).json({ error: 'Authentication required to test assets.' });
    }

    const testResult = await assetVerificationService.testAssetAgainstTransactions({
      assetType,
      assetId,
      checkerUser: { id: user.id, name: user.name || user.username || 'Checker' },
      sampleLimit: req.body.sampleLimit ? Number(req.body.sampleLimit) : 10
    });

    return res.status(200).json({
      success: true,
      testResult
    });
  } catch (err: any) {
    console.error('Error testing asset:', err);
    return res.status(500).json({ error: err.message || 'Failed to execute test against transactions' });
  }
});

/**
 * POST /api/assets/:type/:id/approve
 * Approves and locks an asset. Enforces Anti-Self-Approval.
 */
assetSharingRouter.post('/:type/:id/approve', async (req: Request, res: Response) => {
  try {
    const assetType = req.params.type.toUpperCase() as AssetType;
    const assetId = req.params.id;
    const user = (req as any).user || (req.headers['x-user-id'] ? {
      id: req.headers['x-user-id'] as string,
      name: (req.headers['x-user-name'] as string) || 'Checker'
    } : null);

    if (!user) {
      return res.status(401).json({ error: 'Authentication required to approve operational assets.' });
    }

    const result = await assetVerificationService.approveAsset({
      assetType,
      assetId,
      checkerUser: { id: user.id, name: user.name || user.username || 'Checker' },
      feedback: req.body.feedback
    });

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('Error approving asset:', err);
    const status = err.message?.includes('Anti-Self-Approval') ? 403 : 500;
    return res.status(status).json({ error: err.message || 'Failed to approve asset' });
  }
});

/**
 * POST /api/assets/:type/:id/decline
 * Declines an asset with checker feedback.
 */
assetSharingRouter.post('/:type/:id/decline', async (req: Request, res: Response) => {
  try {
    const assetType = req.params.type.toUpperCase() as AssetType;
    const assetId = req.params.id;
    const user = (req as any).user || (req.headers['x-user-id'] ? {
      id: req.headers['x-user-id'] as string,
      name: (req.headers['x-user-name'] as string) || 'Checker'
    } : null);

    if (!user) {
      return res.status(401).json({ error: 'Authentication required to decline operational assets.' });
    }

    if (!req.body.feedback) {
      return res.status(400).json({ error: 'Checker feedback is required when declining an asset' });
    }

    const result = await assetVerificationService.declineAsset({
      assetType,
      assetId,
      checkerUser: { id: user.id, name: user.name || user.username || 'Checker' },
      feedback: req.body.feedback
    });

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('Error declining asset:', err);
    return res.status(500).json({ error: err.message || 'Failed to decline asset' });
  }
});

/**
 * POST /api/assets/:type/:id/unlock
 * Unlocks a locked approved asset. Only approving Checker or Admin can unlock.
 */
assetSharingRouter.post('/:type/:id/unlock', async (req: Request, res: Response) => {
  try {
    const assetType = req.params.type.toUpperCase() as AssetType;
    const assetId = req.params.id;
    const actor = getVerifiedActor(req);

    if (!actor.id || actor.id === 'system') {
      return res.status(401).json({ error: 'Authentication required to unlock operational assets.' });
    }

    const result = await assetVerificationService.unlockAsset({
      assetType,
      assetId,
      requestingUser: { id: actor.id, name: actor.name || actor.username || 'Checker', role: actor.role }
    });

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('Error unlocking asset:', err);
    const status = err.message?.includes('Permission Denied') ? 403 : 500;
    return res.status(status).json({ error: err.message || 'Failed to unlock asset' });
  }
});

/**
 * GET /api/assets/team-staged/:teamId
 * Fetches all assets staged for a team in the Team Resource Center.
 */
assetSharingRouter.get('/team-staged/:teamId', async (req: Request, res: Response) => {
  try {
    const teamId = req.params.teamId;
    const stagedAssets = await assetSharingService.getTeamStagedAssets(teamId);
    return res.status(200).json({ success: true, ...stagedAssets });
  } catch (err: any) {
    console.error('Error fetching team staged assets:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch team staged assets' });
  }
});

/**
 * GET /api/assets/direct-shares
 * Fetches assets shared directly with the current user.
 */
assetSharingRouter.get('/direct-shares', async (req: Request, res: Response) => {
  try {
    const actor = getVerifiedActor(req);

    if (!actor.id || actor.id === 'system') {
      return res.status(401).json({ error: 'Authentication required to view direct shares.' });
    }

    const userId = (req.query.userId as string) || actor.id;
    const isAdmin = actor.role === 'admin' || actor.role === 'system_admin';
    if (!isAdmin && userId !== actor.id) {
      return res.status(403).json({ error: 'Access Denied: You cannot view direct shares for other users.' });
    }

    const shares = await assetSharingService.getDirectSharesForUser(userId);
    return res.status(200).json({ success: true, shares });
  } catch (err: any) {
    console.error('Error fetching direct shares:', err);
    return res.status(500).json({ error: err.message || 'Failed to fetch direct shares' });
  }
});
