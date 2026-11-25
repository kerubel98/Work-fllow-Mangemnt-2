/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import express from 'express';
import { connectPostgres, queryPg } from '../../config/postgres.js';
import { validationPipelineBuilder } from '../validationPipelineBuilder.js';
import { workflowsRouter } from '../../routes/workflows.js';
import { workflowBundlesRouter } from '../../routes/workflowBundles.js';
import { eventsRouter } from '../../routes/events.js';
import { generateToken, verifyToken } from '../../utils/auth.js';
import { DatabaseValidationWorkflow, ProcessingStage } from '../../types.js';

describe('Workflow Studio and Security Audit Remediation (AUD-WFS-001..006, AUD-GOV-001)', () => {
  let server: http.Server;
  let baseUrl: string;
  let testAdminToken: string;
  let testUserToken: string;
  let testWorkflowId: string;
  let testTeamId = 'team-wfs-audit';

  beforeAll(async () => {
    await connectPostgres();

    // Create Express test harness
    const app = express();
    app.use(express.json());

    // Middleware to simulate JWT authentication from Bearer header
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

    app.use('/api/workflows', workflowsRouter);
    app.use('/api/workflow-bundles', workflowBundlesRouter);
    app.use('/api', eventsRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    testAdminToken = generateToken({
      id: 'usr-admin-wfs',
      username: 'admin_wfs',
      email: 'admin@wfs.test',
      role: 'admin',
      isApproved: true
    });

    testUserToken = generateToken({
      id: 'usr-analyst-wfs',
      username: 'analyst_wfs',
      email: 'analyst@wfs.test',
      role: 'operational',
      isApproved: true
    });

    // Seed test team
    await queryPg(`
      INSERT INTO teams (id, name, description, manager_id, manager_name)
      VALUES ($1, 'WFS Audit Team', 'Team for WFS audit tests', 'usr-mgr-wfs', 'Manager WFS')
      ON CONFLICT (id) DO NOTHING;
    `, [testTeamId]);

    // Seed test workflow
    testWorkflowId = `wf-sec-${Date.now()}`;
    await queryPg(`
      INSERT INTO database_validation_workflows (id, name, description, team_id, is_public, visibility, stages, steps, nodes, connections)
      VALUES ($1, 'Security Test Workflow', 'Testing audit fixes', $2, false, 'team', '[]', '[]', '[]', '[]')
      ON CONFLICT (id) DO NOTHING;
    `, [testWorkflowId, testTeamId]);
  });

  afterAll(async () => {
    try {
      await queryPg('DELETE FROM query_extractions WHERE workflow_id = $1;', [testWorkflowId]);
      await queryPg('DELETE FROM workflow_bundles WHERE workflow_id = $1;', [testWorkflowId]);
      await queryPg('DELETE FROM database_validation_workflows WHERE id = $1;', [testWorkflowId]);
      await queryPg('DELETE FROM teams WHERE id = $1;', [testTeamId]);
    } catch {}

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // 1. AUD-WFS-002: Cycle Detection with Node- vs Stage- Prefix Discrepancy
  it('1. [AUD-WFS-002] validationPipelineBuilder catches cycles when node IDs differ from stage IDs', () => {
    const stageA: ProcessingStage = {
      id: 'stage-node-alpha',
      name: 'Alpha Ingress',
      order: 1,
      enabled: true,
      targetDbId: 'db-1',
      targetDataSource: 'tab_a',
      cardinalityPolicy: 'STRICT_SINGLE'
    };
    const stageB: ProcessingStage = {
      id: 'stage-node-beta',
      name: 'Beta Match',
      order: 2,
      enabled: true,
      targetDbId: 'db-1',
      targetDataSource: 'tab_b',
      cardinalityPolicy: 'STRICT_SINGLE'
    };

    const cyclicFlow: DatabaseValidationWorkflow = {
      id: 'wf-cycle-test',
      name: 'Prefix Discrepancy Cyclic Workflow',
      targetDbId: 'db-1',
      targetTable: 'tab_a',
      stages: [stageA, stageB],
      steps: [
        { id: 's1', stepNumber: 1, name: 'S1', stageId: 'stage-node-alpha', checkType: 'EXISTENCE_CHECK', targetDbId: 'db-1', targetTable: 'tab_a' },
        { id: 's2', stepNumber: 2, name: 'S2', stageId: 'stage-node-beta', checkType: 'EXISTENCE_CHECK', targetDbId: 'db-1', targetTable: 'tab_b' }
      ],
      connections: [
        { id: 'c1', fromNodeId: 'node-alpha', toNodeId: 'node-beta', action: 'CONTINUE' },
        { id: 'c2', fromNodeId: 'node-beta', toNodeId: 'node-alpha', action: 'CONTINUE' }
      ]
    };

    expect(() => validationPipelineBuilder.compile(cyclicFlow)).toThrow(
      /COMPILATION_ERROR: Cycle detected in workflow graph/
    );
  });

  // 2. AUD-WFS-001: SQL Injection Defense in /query-sandbox/preview
  it('2a. [AUD-WFS-001] /query-sandbox/preview rejects malicious targetDataSource containing SQL injection', async () => {
    const res = await fetch(`${baseUrl}/api/workflows/query-sandbox/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`
      },
      body: JSON.stringify({
        extraction: {
          targetDataSource: 'transactions; DROP TABLE database_validation_workflows; --',
          selectedColumns: [{ sourceColumn: 'id' }]
        }
      })
    });

    const body = await res.json() as any;
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Invalid table identifier/);
  });

  it('2b. [AUD-WFS-001] /query-sandbox/preview rejects malicious column names containing SQL injection', async () => {
    const res = await fetch(`${baseUrl}/api/workflows/query-sandbox/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`
      },
      body: JSON.stringify({
        extraction: {
          targetDataSource: 'transactions',
          selectedColumns: [{ sourceColumn: 'id; SELECT pg_sleep(5);' }]
        }
      })
    });

    const body = await res.json() as any;
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Invalid column identifier/);
  });

  it('2c. [AUD-WFS-001] /query-sandbox/preview safely ANSI-quotes legitimate tables and columns', async () => {
    const res = await fetch(`${baseUrl}/api/workflows/query-sandbox/preview`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`
      },
      body: JSON.stringify({
        extraction: {
          targetDataSource: 'public.transactions',
          keyMappings: [{ sourceField: 'transaction_id' }],
          selectedColumns: [
            { sourceColumn: 'order', alias: 'order_number' },
            { sourceColumn: 'amount' }
          ]
        },
        sampleKeys: ['TX-101']
      })
    });

    const body = await res.json() as any;
    expect(res.status).toBe(200);
    expect(body.sql).toContain('SELECT "order" AS "order_number", "amount" FROM "public"."transactions" WHERE "transaction_id" IN (?);');
  });

  // 3. AUD-WFS-004: Anti-Self-Approval Bypass Prevention in Workflow Bundle Review
  it('3. [AUD-WFS-004] POST /workflow-bundles/:id/review rejects checkerId spoofing', async () => {
    const res = await fetch(`${baseUrl}/api/workflow-bundles/wb-bundle-999/review`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}` // logged in as usr-analyst-wfs
      },
      body: JSON.stringify({
        checkerId: 'different-checker-id-forged', // attempting to spoof another checker
        action: 'APPROVE',
        feedback: 'Self approving through forged body checkerId'
      })
    });

    const body = await res.json() as any;
    expect(res.status).toBe(403);
    expect(body.error).toMatch(/checkerId spoofing prevented/);
  });

  // 4. AUD-WFS-006: Referential Integrity Guard on Workflow Deletion
  it('4. [AUD-WFS-006] DELETE /api/workflows/:id blocks deletion when bound to active bundle', async () => {
    // Create bundle referencing testWorkflowId
    const bundleId = `bundle-ref-${Date.now()}`;
    await queryPg(`
      INSERT INTO workflow_bundles (
        id, bundle_code, name, description, version, scope, workflow_id,
        validation_box_ids, source_team_id, maker_id, maker_name, status,
        evidence_snapshot, hashtag_bindings
      )
      VALUES (
        $1, $2, 'Active Bundle', 'Referencing workflow', '1.0.0', 'TEAM', $3,
        '[]', $4, 'maker-1', 'Maker', 'APPROVED',
        '{}', '[]'
      )
      ON CONFLICT (id) DO NOTHING;
    `, [bundleId, `WB-${Date.now()}`, testWorkflowId, testTeamId]);

    const res = await fetch(`${baseUrl}/api/workflows/${testWorkflowId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${testAdminToken}`
      }
    });

    const body = await res.json() as any;
    expect(res.status).toBe(409);
    expect(body.error).toMatch(/referenced by active workflow bundle/);

    // Clean up bundle
    await queryPg('DELETE FROM workflow_bundles WHERE id = $1;', [bundleId]);
  });

  // 5. AUD-GOV-001: SSE /api/events Authentication Enforcement
  it('5a. [AUD-GOV-001] GET /api/events rejects unauthenticated connection without token', async () => {
    const res = await fetch(`${baseUrl}/api/events`);

    const body = await res.json() as any;
    expect(res.status).toBe(401);
    expect(body.error).toMatch(/Authentication required/);
  });

  it('5b. [AUD-GOV-001] GET /api/events/stats rejects unauthenticated requests', async () => {
    const res = await fetch(`${baseUrl}/api/events/stats`);

    expect(res.status).toBe(401);
  });

  it('5c. [AUD-GOV-001] GET /api/events/stats succeeds when authenticated with Bearer token', async () => {
    const res = await fetch(`${baseUrl}/api/events/stats`, {
      headers: {
        Authorization: `Bearer ${testUserToken}`
      }
    });

    const body = await res.json() as any;
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('activeConnections');
  });
});
