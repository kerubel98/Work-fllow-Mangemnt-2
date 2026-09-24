/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { analyticsService } from '../services/analyticsService.js';

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
    const kpis = await analyticsService.getTeamKpis(teamId);
    return res.json(kpis);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
