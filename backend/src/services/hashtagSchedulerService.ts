/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Scheduled Hashtag Automation & Engine Poller
 * Handles periodic automated execution of hashtags configured with
 * executionTrigger = 'SCHEDULED_CRON'.
 */

import { repo } from '../store/repository.js';
import { HashtagPreset } from '../types.js';
import {
  executeDatabaseDirectScan,
  executeExtractionStaging,
  executeAuditingGovernance
} from './hashtagService.js';

let schedulerInterval: NodeJS.Timeout | null = null;
let isExecuting = false;

export interface ScheduledHashtagRunSummary {
  tag: string;
  hashtagType: string;
  verdict: string;
  rowsScanned: number;
  anomaliesDetected: number;
  makerProposalId?: string | null;
  error?: string;
}

export const hashtagSchedulerService = {
  /**
   * Executes all active hashtags configured with SCHEDULED_CRON.
   * Can be invoked directly during tests or on a scheduled cadence.
   */
  async runDueScheduledHashtags(forceAll: boolean = false): Promise<{
    executedCount: number;
    results: ScheduledHashtagRunSummary[];
    durationMs: number;
  }> {
    if (isExecuting) {
      return { executedCount: 0, results: [], durationMs: 0 };
    }
    isExecuting = true;
    const startTime = Date.now();
    const results: ScheduledHashtagRunSummary[] = [];

    try {
      const allPresets = await repo.getHashtags();
      const scheduledPresets = allPresets.filter(p =>
        forceAll || p.executionTrigger === 'SCHEDULED_CRON'
      );

      for (const preset of scheduledPresets) {
        const type = preset.hashtagType || 'FILE_INGESTION';
        const tag = preset.tag;

        try {
          if (type === 'DATABASE_DIRECT_SCANNER') {
            const scanResult = await executeDatabaseDirectScan(preset, 'SYSTEM_SCHEDULER', false);
            let makerProposalId: string | null = null;

            // Rule 7 Maker-Checker auto-staging if scan passes with conditionalAction
            if (scanResult.verdict === 'PASS' && preset.conditionalAction) {
              const action = preset.conditionalAction.onPass;
              if (action === 'EXECUTE_SQL' || action === 'STAGE_PROPOSAL') {
                try {
                  const { approvalService } = await import('./approvalService.js');
                  const proposal = await approvalService.submitProposal({
                    type: 'WORKSPACE_SETTING',
                    settingKey: tag,
                    title: `Automated Scheduled Remediation for ${tag}`,
                    justification: `Autonomous cron scan passed. Triggering conditional action: ${action}`,
                    makerId: 'SYSTEM_SCHEDULER',
                    makerName: 'Autonomous Scheduler',
                    teamId: 'default-team',
                    proposedChanges: {
                      action,
                      sql: preset.solutionTemplate || null,
                      hashtag: tag
                    },
                    evidenceSnapshot: {
                      scanResult: {
                        rowsScanned: scanResult.rowsScanned,
                        anomaliesDetected: scanResult.anomaliesDetected,
                        verdict: scanResult.verdict
                      }
                    }
                  });
                  makerProposalId = proposal.id;
                } catch (propErr: any) {
                  console.warn(`[hashtagScheduler] Could not stage Maker proposal: ${propErr.message}`);
                }
              }
            }

            const runId = `sched-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            await repo.recordHashtagRun({
              id: runId,
              hashtagTag: tag,
              executedBy: 'SYSTEM_SCHEDULER',
              executionMode: 'LIVE_FULL',
              rowsScanned: scanResult.rowsScanned,
              anomaliesDetected: scanResult.anomaliesDetected,
              verdict: scanResult.verdict,
              makerProposalId,
              resultSnapshot: {
                anomalyRows: scanResult.anomalyRows.slice(0, 50),
                errors: scanResult.errors,
                executionDurationMs: scanResult.executionDurationMs,
                makerProposalId
              },
              isDiagnosticOnly: false,
              executedAt: new Date().toISOString()
            });

            results.push({
              tag,
              hashtagType: type,
              verdict: scanResult.verdict,
              rowsScanned: scanResult.rowsScanned,
              anomaliesDetected: scanResult.anomaliesDetected,
              makerProposalId
            });
          } else if (type === 'EXTRACTION_STAGING') {
            const stagingResult = await executeExtractionStaging(preset, 'SYSTEM_SCHEDULER');
            const runId = `sched-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

            await repo.recordHashtagRun({
              id: runId,
              hashtagTag: tag,
              executedBy: 'SYSTEM_SCHEDULER',
              executionMode: 'LIVE_FULL',
              rowsScanned: stagingResult.rowsExtracted,
              anomaliesDetected: stagingResult.errors.length,
              verdict: stagingResult.verdict,
              resultSnapshot: {
                rowsExtracted: stagingResult.rowsExtracted,
                rowsInserted: stagingResult.rowsInserted,
                stagedTableName: stagingResult.stagedTableName,
                errors: stagingResult.errors
              },
              isDiagnosticOnly: false,
              executedAt: new Date().toISOString()
            });

            results.push({
              tag,
              hashtagType: type,
              verdict: stagingResult.verdict,
              rowsScanned: stagingResult.rowsExtracted,
              anomaliesDetected: stagingResult.errors.length
            });
          } else if (type === 'AUDITING_GOVERNANCE') {
            const auditResult = await executeAuditingGovernance(preset);
            const runId = `sched-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

            await repo.recordHashtagRun({
              id: runId,
              hashtagTag: tag,
              executedBy: 'SYSTEM_SCHEDULER',
              executionMode: 'LIVE_FULL',
              rowsScanned: auditResult.auditRows.length,
              anomaliesDetected: auditResult.slaBreachedCount,
              verdict: auditResult.verdict,
              resultSnapshot: {
                slaCompliantCount: auditResult.slaCompliantCount,
                slaBreachedCount: auditResult.slaBreachedCount,
                makerCheckerAdherenceRate: auditResult.makerCheckerAdherenceRate
              },
              isDiagnosticOnly: true,
              executedAt: new Date().toISOString()
            });

            results.push({
              tag,
              hashtagType: type,
              verdict: auditResult.verdict,
              rowsScanned: auditResult.auditRows.length,
              anomaliesDetected: auditResult.slaBreachedCount
            });
          }
        } catch (presetErr: any) {
          results.push({
            tag,
            hashtagType: type,
            verdict: 'FAIL',
            rowsScanned: 0,
            anomaliesDetected: 0,
            error: presetErr.message
          });
        }
      }
    } finally {
      isExecuting = false;
    }

    return {
      executedCount: results.length,
      results,
      durationMs: Date.now() - startTime
    };
  },

  /**
   * Starts background recurring poller for scheduled hashtags.
   */
  startHashtagScheduler(intervalMs: number = 60000): void {
    if (schedulerInterval) return;
    console.log(`[HashtagScheduler] Autonomous hashtag scheduler started (interval: ${intervalMs}ms).`);
    schedulerInterval = setInterval(async () => {
      try {
        const res = await hashtagSchedulerService.runDueScheduledHashtags(false);
        if (res.executedCount > 0) {
          console.log(`[HashtagScheduler] Swept ${res.executedCount} scheduled hashtag(s) in ${res.durationMs}ms.`);
        }
      } catch (err: any) {
        console.warn(`[HashtagScheduler] Error during scheduled hashtag sweep:`, err.message);
      }
    }, intervalMs);
  },

  /**
   * Stops background poller.
   */
  stopHashtagScheduler(): void {
    if (schedulerInterval) {
      clearInterval(schedulerInterval);
      schedulerInterval = null;
      console.log(`[HashtagScheduler] Autonomous hashtag scheduler stopped.`);
    }
  }
};
