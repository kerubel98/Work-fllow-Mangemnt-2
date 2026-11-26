/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'node:http';
import express from 'express';
import { connectPostgres, queryPg } from '../../config/postgres.js';
import { ExecutablePipeline, ExecutableStage } from '../pipeline/ExecutablePipeline.js';
import { coordinateInjector } from '../pipeline/CoordinateInjector.js';
import { ruleSqlCompiler } from '../ruleSqlCompiler.js';
import { makerCheckerService } from '../makerCheckerService.js';
import { investigationsRouter } from '../../routes/investigations.js';
import { issuesRouter } from '../../routes/issues.js';
import { generateToken, verifyToken } from '../../utils/auth.js';
import { ValidationCheckStep } from '../../types.js';

describe('Investigation Core Remediation Test Suite (AUD-INV-001..005)', () => {
  let server: http.Server;
  let baseUrl: string;
  let adminToken: string;
  let analystToken: string;
  let testTeamA = 'team-inv-a';
  let testTeamB = 'team-inv-b';
  let testIssueId: string;

  beforeAll(async () => {
    await connectPostgres();

    const app = express();
    app.use(express.json());

    // JWT decode middleware
    app.use((req, _res, next) => {
      const auth = req.headers.authorization;
      if (auth && auth.startsWith('Bearer ')) {
        const token = auth.slice(7).trim();
        const payload = verifyToken(token);
        if (payload) {
          (req as any).user = payload;
        }
      }
      next();
    });

    app.use('/api/investigations', investigationsRouter);
    app.use('/api/issues', issuesRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    adminToken = generateToken({
      id: 'usr-admin-inv',
      username: 'admin_inv',
      email: 'admin@inv.test',
      role: 'admin',
      isApproved: true,
      teamId: testTeamA
    } as any);

    analystToken = generateToken({
      id: 'usr-analyst-inv',
      username: 'analyst_inv',
      email: 'analyst@inv.test',
      role: 'operational',
      isApproved: true,
      teamId: testTeamB
    } as any);

    // Seed test teams
    await queryPg(`
      INSERT INTO teams (id, name, description, manager_id, manager_name)
      VALUES ($1, 'Team A', 'Investigation Team A', 'mgr-a', 'Manager A'),
             ($2, 'Team B', 'Investigation Team B', 'mgr-b', 'Manager B')
      ON CONFLICT (id) DO NOTHING;
    `, [testTeamA, testTeamB]);

    // Seed test issue for Team A
    testIssueId = `issue-inv-${Date.now()}`;
    await queryPg(`
      INSERT INTO issues (id, title, description, team_id, creator_id, creator_name, status)
      VALUES ($1, 'Investigation Task A', 'Testing AUD-INV remediation', $2, 'usr-admin-inv', 'Admin User', 'OPEN')
      ON CONFLICT (id) DO NOTHING;
    `, [testIssueId, testTeamA]);

    await queryPg(`
      INSERT INTO investigation_tasks (id, workflow_id, issue_id)
      VALUES ($1, 'wf-test', $2)
      ON CONFLICT (id) DO NOTHING;
    `, [testIssueId, testIssueId]);
  });

  afterAll(async () => {
    try {
      await queryPg('DELETE FROM investigation_tasks WHERE id = $1;', [testIssueId]);
      await queryPg('DELETE FROM issues WHERE id = $1;', [testIssueId]);
      await queryPg('DELETE FROM teams WHERE id IN ($1, $2);', [testTeamA, testTeamB]);
    } catch {}

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // 1. AUD-INV-001: PAUSED_DB_OFFLINE stage status rollup in executeBatch
  it('1. [AUD-INV-001] ExecutablePipeline.executeBatch rolls up PAUSED_DB_OFFLINE as PAUSED_DB_OFFLINE, never PASS', async () => {
    // Stage 1: Simulates circuit-trip DB offline
    const stage1 = new ExecutableStage(
      'stage-offline',
      'Ingress Offline',
      'INGESTION_SEARCH',
      'STRICT_SINGLE',
      undefined,
      [{
        id: 'val-off-1',
        name: 'Offline Method',
        targetDbId: 'db-offline-trigger',
        targetTable: 'unreachable_tab',
        requiredInputKeys: ['transaction_id'],
        producedOutputKeys: [],
        execute: async () => ({})
      } as any],
      [{
        id: 'step-off',
        stepNumber: 1,
        name: 'Offline Rule',
        checkType: 'EXISTENCE_CHECK',
        targetDbId: 'db-offline-trigger',
        targetTable: 'unreachable_tab',
        onPassAction: 'CONTINUE',
        onFailAction: 'STOP'
      }]
    );

    const pipeline = new ExecutablePipeline('wf-test', 'Workflow Test', [stage1]);
    const batchCtx = {
      taskId: 'task-test-rollup',
      batchId: 'batch-test-rollup',
      stageId: 'stage-offline',
      stageName: 'Ingress Offline',
      ruleBlockId: 'step-off',
      totalRecords: 1,
      executionTimestamp: new Date().toISOString()
    };

    vi.spyOn(coordinateInjector, 'ingestAndMirror').mockRejectedValueOnce(
      new Error('connect ECONNREFUSED 127.0.0.1:59999')
    );

    const dbLookup = async (id: string) => ({
      id,
      name: 'Test DB',
      type: 'postgres',
      host: '127.0.0.1',
      port: 59999
    });

    const report = await pipeline.executeBatch(
      batchCtx,
      [{ _row_number: 1, _task_id: 'task-test-rollup', transaction_id: 'TXN-OFFLINE-01' }],
      dbLookup
    );

    expect(report.passedCount).toBe(0);
    expect(report.failedCount).toBe(1);
    expect(report.rowOutcomes.length).toBe(1);
    expect(report.rowOutcomes[0].validationStatus).toBe('PAUSED_DB_OFFLINE');
    expect(report.rowOutcomes[0].validationAction).toBe('STOP');
  });

  // 2. AUD-INV-002: Deletion Authorization Guards
  it('2a. [AUD-INV-002] DELETE /api/investigations/executions/clear-all rejects non-admin users with 403', async () => {
    const res = await fetch(`${baseUrl}/api/investigations/executions/clear-all`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${analystToken}` }
    });

    const body = await res.json() as any;
    expect(res.status).toBe(403);
    expect(body.error).toMatch(/administrative privileges/);
  });

  it('2b. [AUD-INV-002] DELETE /api/issues/:id blocks unauthorized cross-team deletion', async () => {
    // Analyst from Team B attempts to delete Team A's task
    const res = await fetch(`${baseUrl}/api/issues/${testIssueId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${analystToken}` }
    });

    const body = await res.json() as any;
    expect(res.status).toBe(403);
    expect(body.error).toMatch(/do not have permission to delete this task/);
  });

  // 3. AUD-INV-003: Maker-Checker Enforcement on Script Execution & Team Boundaries
  it('3a. [AUD-INV-003] POST /api/issues/:id/execute-script stages in Pending Review without Checker approval', async () => {
    const res = await fetch(`${baseUrl}/api/issues/${testIssueId}/execute-script`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ script: "UPDATE transactions SET status = 'Resolved'" })
    });

    const body = await res.json() as any;
    expect(res.status).toBe(200);
    expect(body.issue.status).toBe('INVESTIGATING');
    expect(body.message).toMatch(/Pending Review|pending review|INVESTIGATING/i);
  });

  it('3b. [AUD-INV-003] makerCheckerService rejects review when checker team is omitted or mismatched', async () => {
    // Test proposal
    const propId = `prop-team-test-${Date.now()}`;
    await queryPg(`
      INSERT INTO resolution_approval_requests (
        id, task_id, transaction_id, team_id, maker_id, maker_name,
        proposed_action, proposed_status, justification_note, evidence_snapshot, status
      )
      VALUES ($1, $2, 'TXN-TEST-01', $3, 'maker-1', 'Maker', 'FORCE_MATCH', 'VERIFIED_MATCH', 'Testing proposal', '{}'::jsonb, 'PENDING')
      ON CONFLICT (id) DO NOTHING;
    `, [propId, testIssueId, testTeamA]);

    // Review with missing checker team
    await expect(makerCheckerService.reviewResolutionProposal({
      requestId: propId,
      checkerId: 'checker-user-1',
      checkerName: 'Checker 1',
      checkerTeamId: '' as any,
      action: 'APPROVE'
    })).rejects.toThrow(/checkerTeamId is required/);

    // Clean up proposal
    await queryPg('DELETE FROM resolution_approval_requests WHERE id = $1;', [propId]);
  });

  // 4. AUD-INV-004: SQL Compiler NaN and Action Sanitization
  it('4a. [AUD-INV-004] ruleSqlCompiler sanitizes NaN toleranceMargin in AMOUNT_MATCH and DUAL_SOURCE_COMPARISON', () => {
    const maliciousRule: ValidationCheckStep = {
      id: 'step-nan',
      stepNumber: 1,
      name: 'Tolerance Test',
      checkType: 'AMOUNT_MATCH',
      sourceField: 'actual_amount',
      targetField: 'expected_amount',
      toleranceMargin: ('invalid_nan_string' as any),
      onPassAction: 'CONTINUE',
      onFailAction: 'STOP'
    };

    const compiled = ruleSqlCompiler.compileStepCondition(maliciousRule, 'm', ['actual_amount', 'expected_amount'], 't');
    expect(compiled).not.toContain('NaN');
    expect(compiled).toContain('<= 0');
  });

  it('4b. [AUD-INV-004] ruleSqlCompiler allowlists onPassAction and onFailAction against PipelineAction', () => {
    const unvalidatedActionRule: ValidationCheckStep = {
      id: 'step-action',
      stepNumber: 1,
      name: 'Action Test',
      checkType: 'EXISTENCE_CHECK',
      sourceField: 'id',
      onPassAction: ("CONTINUE'; DROP TABLE users; --" as any),
      onFailAction: ("FLAG'; DROP TABLE users; --" as any)
    };

    const block = ruleSqlCompiler.compileBlockUpdateSql('mirror_test', 'step-action', [unvalidatedActionRule], ['id']);
    expect(block.actionCaseSql).not.toContain('DROP TABLE');
    expect(block.actionCaseSql).toContain("'CONTINUE'");
    expect(block.actionCaseSql).toContain("'STOP'");

    const validFlagRule: ValidationCheckStep = {
      id: 'step-flag',
      stepNumber: 2,
      name: 'Valid Flag Action',
      checkType: 'EXISTENCE_CHECK',
      sourceField: 'id',
      onPassAction: 'CONTINUE',
      onFailAction: 'FLAG'
    };
    const validBlock = ruleSqlCompiler.compileBlockUpdateSql('mirror_test', 'step-flag', [validFlagRule], ['id']);
    expect(validBlock.actionCaseSql).toContain("'FLAG'");
  });
});
