/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Scheduled FTP / SFTP File Parsing & Ingestion Service
 * Handles periodic automated file staging on a schedule (Hourly, Daily, Every 15 min),
 * with support for Type-Based execution (e.g. CSV, XML, EXCEL) or All-At-Once batches.
 */
import { repo } from '../store/repository.js';
import { ftpFileStagingService } from './ftpFileStagingService.js';
export const ftpSchedulerService = {
    /**
     * Executes scheduled staging for active configurations.
     * Can be filtered by target file format (e.g. 'CSV', 'EXCEL', 'XML') or 'ALL'.
     */
    async runScheduledFtpStaging(options = {}) {
        const start = Date.now();
        const allConfigs = await repo.getFtpStagingConfigs();
        // Filter configurations
        const matchedConfigs = allConfigs.filter(c => {
            if (options.connectionId && c.ftpConnectionId !== options.connectionId)
                return false;
            if (!options.forceAll && c.scheduleConfig?.enabled !== true)
                return false;
            const targetType = options.targetType || 'ALL';
            if (targetType !== 'ALL') {
                const configFormat = (c.fileFormat || 'CSV').toUpperCase();
                const schedTarget = (c.scheduleConfig?.targetType || 'ALL').toUpperCase();
                if (configFormat !== targetType && schedTarget !== targetType) {
                    return false;
                }
            }
            return true;
        });
        const results = [];
        let totalStaged = 0;
        let totalSkippedMismatches = 0;
        for (const config of matchedConfigs) {
            const configStart = Date.now();
            try {
                const db = await repo.getDatabaseById(config.ftpConnectionId);
                if (!db) {
                    results.push({
                        configId: config.id,
                        configName: config.name,
                        fileFormat: config.fileFormat,
                        success: false,
                        stagedCount: 0,
                        skippedMismatchesCount: 0,
                        message: `Target FTP/SFTP database connection '${config.ftpConnectionId}' not found.`,
                        executionTimeMs: Date.now() - configStart
                    });
                    continue;
                }
                const stageRes = await ftpFileStagingService.stageFtpFileForValidation(db, config);
                const skippedCount = Array.isArray(stageRes.skippedMismatches) ? stageRes.skippedMismatches.length : 0;
                totalStaged += stageRes.stagedCount;
                totalSkippedMismatches += skippedCount;
                // Update schedule metadata
                if (config.scheduleConfig) {
                    await repo.updateFtpStagingConfig(config.id, {
                        scheduleConfig: {
                            ...config.scheduleConfig,
                            lastRunAt: new Date().toISOString()
                        }
                    });
                }
                results.push({
                    configId: config.id,
                    configName: config.name,
                    fileFormat: config.fileFormat,
                    success: true,
                    stagedCount: stageRes.stagedCount,
                    skippedMismatchesCount: skippedCount,
                    message: stageRes.message,
                    executionTimeMs: Date.now() - configStart
                });
            }
            catch (err) {
                results.push({
                    configId: config.id,
                    configName: config.name,
                    fileFormat: config.fileFormat,
                    success: false,
                    stagedCount: 0,
                    skippedMismatchesCount: 0,
                    message: err.message || 'Execution failed',
                    executionTimeMs: Date.now() - configStart
                });
            }
        }
        return {
            success: true,
            executedCount: results.length,
            totalStaged,
            totalSkippedMismatches,
            results,
            executionTimeMs: Date.now() - start
        };
    }
};
