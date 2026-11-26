/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Automations Router (AUD-AUTO-001..006)
 * Governs PostgreSQL-backed automation jobs, execution run ledger, and DLQ.
 */

import { Router, Request, Response } from 'express';
import { repo } from '../store/repository.js';
import { eventService } from '../services/events.js';
import { ftpSchedulerService } from '../services/ftpSchedulerService.js';
import { hashtagSchedulerService } from '../services/hashtagSchedulerService.js';
import { AutomationJob } from '../types.js';

export const automationsRouter = Router();

// GET /api/automations - List all automation jobs
automationsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const teamId = (req.query.teamId as string) || (req as any).user?.teamId;
    const jobs = await repo.getAutomationJobs(teamId);
    return res.json(jobs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to fetch automation jobs' });
  }
});

// GET /api/automations/metrics - Summary metrics for automations hub
automationsRouter.get('/metrics', async (req: Request, res: Response) => {
  try {
    const teamId = (req.query.teamId as string) || (req as any).user?.teamId;
    const metrics = await repo.getAutomationMetrics(teamId);
    return res.json(metrics);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to fetch automation metrics' });
  }
});

// GET /api/automations/runs - Execution run history
automationsRouter.get('/runs', async (req: Request, res: Response) => {
  try {
    const jobId = req.query.jobId as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const runs = await repo.getAutomationRuns(jobId, limit);
    return res.json(runs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to fetch automation runs' });
  }
});

// GET /api/automations/dlq - Dead-Letter Queue entries
automationsRouter.get('/dlq', async (req: Request, res: Response) => {
  try {
    const teamId = (req.query.teamId as string) || (req as any).user?.teamId;
    const entries = await repo.getAutomationDLQ(teamId);
    return res.json(entries);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to fetch DLQ entries' });
  }
});

// POST /api/automations - Create new automation job
automationsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name, description, triggerType, scheduleCron, attachedWorkflowId, targetDbId, teamId, config } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Automation name is required' });
    }

    const effectiveTeamId = teamId || (req as any).user?.teamId || 'default-team';
    const newJob = await repo.createAutomationJob({
      name: name.trim(),
      description: description?.trim() || null,
      triggerType: triggerType || 'CRON',
      scheduleCron: scheduleCron || '0 2 * * *',
      attachedWorkflowId: attachedWorkflowId || null,
      targetDbId: targetDbId || null,
      teamId: effectiveTeamId,
      isActive: true,
      config: config || {}
    });

    eventService.broadcastEvent('automation:job_created', newJob);
    return res.status(201).json(newJob);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to create automation job' });
  }
});

// GET /api/automations/:id - Get specific job
automationsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const job = await repo.getAutomationJob(req.params.id);
    if (!job) return res.status(404).json({ error: 'Automation job not found' });
    return res.json(job);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to fetch job' });
  }
});

// PUT /api/automations/:id - Update automation job
automationsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await repo.getAutomationJob(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Automation job not found' });

    const updated = await repo.updateAutomationJob(req.params.id, req.body);
    eventService.broadcastEvent('automation:job_updated', updated);
    return res.json(updated);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to update job' });
  }
});

// DELETE /api/automations/:id - Delete automation job
automationsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await repo.getAutomationJob(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Automation job not found' });

    await repo.deleteAutomationJob(req.params.id);
    eventService.broadcastEvent('automation:job_deleted', { id: req.params.id });
    return res.json({ success: true, deletedId: req.params.id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to delete job' });
  }
});

// POST /api/automations/:id/run - Execute automation job immediately
automationsRouter.post('/:id/run', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const jobId = req.params.id;

  try {
    const job = await repo.getAutomationJob(jobId);
    if (!job) return res.status(404).json({ error: 'Automation job not found' });

    let rowsProcessed = 0;
    let anomaliesDetected = 0;
    let details: any = {};

    if (job.triggerType === 'FTP_POLL') {
      const ftpResult = await ftpSchedulerService.runScheduledFtpStaging({ forceAll: true });
      rowsProcessed = ftpResult.totalStaged;
      anomaliesDetected = ftpResult.totalSkippedMismatches;
      details = ftpResult;
    } else {
      // Execute hashtag or workflow scan
      const sweep = await hashtagSchedulerService.runDueScheduledHashtags(true);
      rowsProcessed = sweep.results.reduce((acc, r) => acc + (r.rowsScanned || 0), 0);
      anomaliesDetected = sweep.results.reduce((acc, r) => acc + (r.anomaliesDetected || 0), 0);
      details = sweep;
    }

    const durationMs = Date.now() - startTime;
    const run = await repo.recordAutomationRun({
      jobId,
      triggerSource: 'MANUAL',
      status: 'SUCCESS',
      durationMs,
      rowsProcessed,
      anomaliesDetected
    });

    eventService.broadcastEvent('automation:run_completed', {
      jobId,
      runId: run.id,
      status: 'SUCCESS',
      durationMs,
      rowsProcessed,
      anomaliesDetected
    });

    return res.json({
      success: true,
      run,
      details
    });
  } catch (err: any) {
    const durationMs = Date.now() - startTime;
    const errorMsg = err.message || 'Automation execution failed';

    const failedRun = await repo.recordAutomationRun({
      jobId,
      triggerSource: 'MANUAL',
      status: 'FAILED',
      durationMs,
      rowsProcessed: 0,
      anomaliesDetected: 0,
      errorMessage: errorMsg
    });

    // Send to Dead-Letter Queue
    await repo.recordAutomationDLQ({
      jobId,
      jobName: req.body?.name || `Job ${jobId}`,
      runId: failedRun.id,
      errorPayload: { error: errorMsg, stack: err.stack },
      retryCount: 1,
      status: 'PENDING'
    });

    eventService.broadcastEvent('automation:run_failed', {
      jobId,
      runId: failedRun.id,
      status: 'FAILED',
      error: errorMsg
    });

    return res.status(500).json({
      success: false,
      error: errorMsg,
      run: failedRun
    });
  }
});
