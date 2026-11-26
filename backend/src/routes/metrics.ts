/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { analyticsService } from '../services/analyticsService.js';
import { repo } from '../store/repository.js';

export const metricsRouter = Router();

// GET /api/metrics/overview - Live operational control room summary
metricsRouter.get('/overview', async (_req: Request, res: Response) => {
  try {
    const overview = await analyticsService.getOperationalOverview();
    return res.json(overview);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/metrics/team/:teamId - Live team KPI inflow and outflow
metricsRouter.get('/team/:teamId', async (req: Request, res: Response) => {
  try {
    const { teamId } = req.params;
    const user = (req as any).user;

    // Authorization check (AUD-EXT-003): Require admin role or verified team membership
    const isAdmin = user && (user.role === 'admin' || user.role === 'system_admin');
    if (!isAdmin) {
      const userTeamId = user?.teamId || user?.permanentTeamId || user?.permanent_team_id;
      let isAuthorized = userTeamId === teamId;

      if (!isAuthorized && user?.id) {
        const team = await repo.getTeamById(teamId);
        if (team) {
          const isManager = team.managerId === user.id;
          const isMember = Array.isArray(team.memberIds) && team.memberIds.includes(user.id);
          isAuthorized = isManager || isMember;
        }
      }

      if (!isAuthorized) {
        return res.status(403).json({
          error: `Forbidden: You do not have permission to view KPIs for team "${teamId}".`
        });
      }
    }

    const kpis = await analyticsService.getTeamKpis(teamId);
    return res.json(kpis);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
