/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Automation Process Remediation Verification Test Suite
 * Governs: AUD-AUTO-001 through AUD-AUTO-006
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectPostgres, getPostgresPool } from '../../config/postgres.js';
import { repo } from '../../store/repository.js';
import { isCronDue, hashtagSchedulerService } from '../hashtagSchedulerService.js';
import { ftpSchedulerService } from '../ftpSchedulerService.js';
import { approvalService } from '../approvalService.js';

describe('Automation Process Remediation Test Suite (AUD-AUTO-001..006)', () => {
  const testJobId = `test-auto-${Date.now()}`;
  const testTeamId = `team-auto-${Date.now()}`;
  const testSettingId = `test-prop-${Date.now()}`;

  beforeAll(async () => {
    await connectPostgres();
    const pool = getPostgresPool();
    await pool.query(`
      INSERT INTO teams (id, name, description, manager_id, manager_name)
      VALUES ($1, 'Automation Team', 'Automation test team', 'mgr-auto', 'Auto Manager')
      ON CONFLICT (id) DO NOTHING;
    `, [testTeamId]);
  });

  afterAll(async () => {
    try {
      const pool = getPostgresPool();
      await pool.query('DELETE FROM automation_jobs WHERE id = $1;', [testJobId]);
      await pool.query('DELETE FROM workspace_setting_proposals WHERE id = $1;', [testSettingId]);
      await pool.query('DELETE FROM teams WHERE id = $1;', [testTeamId]);
      await pool.query('DROP TABLE IF EXISTS test_remediation_proof;');
    } catch {}
  });

  // 1. AUD-AUTO-001: PostgreSQL Persistence of Automation Jobs
  it('AUD-AUTO-001: Should create, persist, retrieve, and update automation jobs in PostgreSQL', async () => {
    const created = await repo.createAutomationJob({
      id: testJobId,
      name: 'Nightly CBE Settlement Reconciler Test',
      description: 'Test reconciliation job for CBE',
      triggerType: 'CRON',
      scheduleCron: '0 2 * * *',
      attachedWorkflowId: 'wf-cbe-test',
      targetDbId: 'cbe_production_db',
      teamId: 'team-finance'
    });

    expect(created.id).toBe(testJobId);
    expect(created.name).toBe('Nightly CBE Settlement Reconciler Test');
    expect(created.triggerType).toBe('CRON');
    expect(created.isActive).toBe(true);

    // Retrieve from DB
    const fetched = await repo.getAutomationJob(testJobId);
    expect(fetched).not.toBeNull();
    expect(fetched!.attachedWorkflowId).toBe('wf-cbe-test');

    // Update
    const updated = await repo.updateAutomationJob(testJobId, {
      name: 'Nightly CBE Settlement Reconciler Renamed',
      isActive: false
    });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('Nightly CBE Settlement Reconciler Renamed');
    expect(updated!.isActive).toBe(false);
  });

  // 2. AUD-AUTO-001: Execution Run Ledger & Parent Timing Update
  it('AUD-AUTO-001: Recording an automation run should update parent job timing and status', async () => {
    const run = await repo.recordAutomationRun({
      jobId: testJobId,
      triggerSource: 'MANUAL',
      status: 'SUCCESS',
      durationMs: 1420,
      rowsProcessed: 5000,
      anomaliesDetected: 3
    });

    expect(run.id).toBeDefined();
    expect(run.jobId).toBe(testJobId);
    expect(run.status).toBe('SUCCESS');
    expect(run.durationMs).toBe(1420);

    // Verify parent job was updated
    const parent = await repo.getAutomationJob(testJobId);
    expect(parent!.lastRunStatus).toBe('SUCCESS');
    expect(parent!.lastRunDurationMs).toBe(1420);
    expect(parent!.lastRunAt).toBeDefined();

    // Verify runs list query
    const runs = await repo.getAutomationRuns(testJobId, 10);
    expect(runs.length).toBeGreaterThanOrEqual(1);
    expect(runs[0].jobId).toBe(testJobId);
  });

  // 3. AUD-AUTO-002: FTP Daemon Registration
  it('AUD-AUTO-002: ftpSchedulerService should start and stop background poller cleanly', () => {
    expect(() => {
      ftpSchedulerService.startFtpScheduler(10000);
      ftpSchedulerService.stopFtpScheduler();
    }).not.toThrow();
  });

  // 4. AUD-AUTO-003: Cron Expression Evaluation & Throttling
  it('AUD-AUTO-003: isCronDue should evaluate 5-part cron syntax and prevent re-execution within 50s', () => {
    // Current minute wildcard matches
    expect(isCronDue('* * * * *')).toBe(true);
    expect(isCronDue('')).toBe(true);

    // Matches if step divides evenly or wildcard
    const now = new Date();
    const currMin = now.getMinutes();
    const matchingCron = `${currMin} * * * *`;
    expect(isCronDue(matchingCron)).toBe(true);

    const nonMatchingCron = `${(currMin + 30) % 60} * * * *`;
    expect(isCronDue(nonMatchingCron)).toBe(false);

    // Should return false if it ran less than 50 seconds ago (throttled)
    const recentRun = new Date(Date.now() - 20000);
    expect(isCronDue(matchingCron, recentRun)).toBe(false);

    // Should return true if it ran more than 50 seconds ago
    const olderRun = new Date(Date.now() - 65000);
    expect(isCronDue(matchingCron, olderRun)).toBe(true);
  });

  // 5. AUD-AUTO-003: 64-Bit Cryptographic Advisory Locking
  it('AUD-AUTO-003: 64-bit advisory lock key derivation should produce valid 64-bit signed integer', async () => {
    const pool = getPostgresPool();
    const res = await pool.query(`SELECT ('x' || substr(md5('hashtag_scheduler_sweep'), 1, 16))::bit(64)::bigint AS lock_key;`);
    expect(res.rows[0].lock_key).toBeDefined();
    expect(typeof res.rows[0].lock_key).toBe('string'); // pg returns bigint as string
    expect(res.rows[0].lock_key.length).toBeGreaterThan(0);
  });

  // 6. AUD-AUTO-005: Dead-Letter Queue (DLQ) & Metrics
  it('AUD-AUTO-005: Failed automation should record in DLQ and aggregate metrics', async () => {
    const dlqEntry = await repo.recordAutomationDLQ({
      jobId: testJobId,
      jobName: 'Test CBE Settlement Reconciler',
      runId: 'run-fail-test',
      errorPayload: { error: 'Network timeout to external SFTP host', code: 'ETIMEDOUT' },
      retryCount: 3,
      status: 'PENDING'
    });

    expect(dlqEntry.id).toBeDefined();
    expect(dlqEntry.jobId).toBe(testJobId);
    expect(dlqEntry.status).toBe('PENDING');

    const dlqList = await repo.getAutomationDLQ();
    const found = dlqList.find(d => d.id === dlqEntry.id);
    expect(found).toBeDefined();

    const metrics = await repo.getAutomationMetrics();
    expect(metrics.totalJobs).toBeGreaterThan(0);
    expect(metrics.dlqPendingCount).toBeGreaterThanOrEqual(1);
  });

  // 7. AUD-AUTO-006: Real SQL Remediation Execution upon Checker Approval
  it('AUD-AUTO-006: Approving setting proposal with SQL should execute script against target database', async () => {
    const pool = getPostgresPool();
    // Create test proof table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS test_remediation_proof (
        id VARCHAR(32) PRIMARY KEY,
        remediated_at TIMESTAMPTZ DEFAULT NOW(),
        status VARCHAR(32)
      );
    `);

    // Submit a proposal with real SQL remediation
    const proposal = await approvalService.submitProposal({
      type: 'WORKSPACE_SETTING',
      settingKey: '#TEST_REMEDIATION',
      title: 'Test Automated Remediation SQL Execution',
      justification: 'Automated test proof',
      makerId: 'SYSTEM_SCHEDULER',
      makerName: 'Autonomous Scheduler',
      teamId: testTeamId,
      proposedChanges: {
        action: 'EXECUTE_SQL',
        sql: `INSERT INTO test_remediation_proof (id, status) VALUES ('proof-1', 'REMEDIATED_SUCCESSFULLY') ON CONFLICT (id) DO UPDATE SET status = 'UPDATED';`,
        hashtag: '#TEST_REMEDIATION'
      }
    });

    // Checker approves the proposal (Rule 7: makerId !== checkerId)
    await approvalService.reviewProposal({
      id: proposal.id,
      checkerId: 'checker-user-99',
      checkerName: 'Senior Checker',
      action: 'APPROVE',
      reason: 'Verified and approved remediation'
    });

    // Verify SQL was physically executed in PostgreSQL!
    const proofRes = await pool.query(`SELECT * FROM test_remediation_proof WHERE id = 'proof-1';`);
    expect(proofRes.rows.length).toBe(1);
    expect(proofRes.rows[0].status).toBe('REMEDIATED_SUCCESSFULLY');
  });
});
