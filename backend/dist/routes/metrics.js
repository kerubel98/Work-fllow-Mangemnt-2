/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Router } from 'express';
import { analyticsService } from '../services/analyticsService.js';
export const metricsRouter = Router();
// GET /api/metrics/overview - Live operational control room summary
metricsRouter.get('/overview', async (_req, res) => {
    try {
        const overview = await analyticsService.getOperationalOverview();
        return res.json(overview);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
// GET /api/metrics/team/:teamId - Live team KPI inflow and outflow
metricsRouter.get('/team/:teamId', async (req, res) => {
    try {
        const { teamId } = req.params;
        const kpis = await analyticsService.getTeamKpis(teamId);
        return res.json(kpis);
    }
    catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
