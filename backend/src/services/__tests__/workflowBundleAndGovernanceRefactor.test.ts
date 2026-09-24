/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connectPostgres, queryPg } from '../../config/postgres.js';
import { workflowBundleService } from '../workflowBundleService.js';
import { approvalService } from '../approvalService.js';

describe('Workflow Bundles and Governance Segregation Refactor Test Suite', () => {
  let testWorkflowId: string;
  let testBoxId: string;
  let testTeamId = 'team-test-gov';

  beforeAll(async () => {
    await connectPostgres();

    // Ensure test team exists with manager_id
    await queryPg(`
      INSERT INTO teams (id, name, description, manager_id, manager_name)
      VALUES ($1, 'Test Governance Team', 'Team for bundle tests', 'usr-test-mgr', 'Test Manager')
      ON CONFLICT (id) DO NOTHING;
    `, [testTeamId]);

    // Ensure a test workflow exists
    testWorkflowId = `wf-gov-${Date.now()}`;
    await queryPg(`
      INSERT INTO database_validation_workflows (id, name, description, team_id, is_public, visibility, stages, steps, nodes, connections)
      VALUES ($1, 'Settlement Validation Flow', 'Test Flow for bundles', $2, false, 'team', '[]', '[]', '[]', '[]')
      ON CONFLICT (id) DO NOTHING;
    `, [testWorkflowId, testTeamId]);

    // Ensure a test validation box exists
    testBoxId = `box-gov-${Date.now()}`;
    await queryPg(`
      INSERT INTO validation_boxes (id, name, box_type, category, check_step, search_parameters, team_id)
      VALUES ($1, 'Amount Matcher Box', 'RECONCILIATION', 'Financial', '{}', '[]', $2)
      ON CONFLICT (id) DO NOTHING;
    `, [testBoxId, testTeamId]);
  });

  it('1. Successfully packages a composite workflow bundle with immutable evidence snapshot', async () => {
    const bundle = await workflowBundleService.createBundle({
      name: 'Q3 Settlement Standard Package',
      description: 'Production composite bundle for Q3 settlement rules',
      version: '1.2.0',
      scope: 'TEAM',
      workflowId: testWorkflowId,
      validationBoxIds: [testBoxId],
      sourceTeamId: testTeamId,
      makerId: 'maker_lead_01',
      makerName: 'Senior Maker Engineer',
      hashtagBindings: ['#SETTLEMENT_2026', '#Q3_RULES']
    });

    expect(bundle).toBeDefined();
    expect(bundle.id).toMatch(/^bundle-/);
    expect(bundle.bundleCode).toMatch(/^WB-/);
    expect(bundle.status).toBe('DRAFT');
    expect(bundle.version).toBe('1.2.0');
    expect(bundle.scope).toBe('TEAM');
    expect(bundle.validationBoxIds).toContain(testBoxId);
    expect(bundle.hashtagBindings).toContain('#SETTLEMENT_2026');

    // Verify Evidence Snapshot contains snapshotted workflow and boxes
    expect(bundle.evidenceSnapshot).toBeDefined();
    expect(bundle.evidenceSnapshot?.workflow?.id).toBe(testWorkflowId);
    expect(bundle.evidenceSnapshot?.validationBoxes?.length).toBeGreaterThan(0);
    expect(bundle.evidenceSnapshot?.validationBoxes[0].name).toBe('Amount Matcher Box');
  });

  it('2. Submits bundle promotion proposal to PENDING_CHECKER_REVIEW', async () => {
    const bundle = await workflowBundleService.createBundle({
      name: 'Promotion Candidate Bundle',
      workflowId: testWorkflowId,
      sourceTeamId: testTeamId,
      makerId: 'maker_operator_02',
      makerName: 'Maker Operator'
    });

    const proposed = await workflowBundleService.proposePromotion(
      bundle.id,
      'GLOBAL_ENTERPRISE',
      'maker_operator_02',
      'Maker Operator'
    );

    expect(proposed.status).toBe('PENDING_CHECKER_REVIEW');
    expect(proposed.scope).toBe('GLOBAL_ENTERPRISE');
  });

  it('3. Strictly rejects promotion self-approval (Anti-Self-Approval / Rule 7)', async () => {
    const bundle = await workflowBundleService.createBundle({
      name: 'Self-Approval Test Bundle',
      workflowId: testWorkflowId,
      sourceTeamId: testTeamId,
      makerId: 'author_maker_03',
      makerName: 'Author Maker'
    });

    await workflowBundleService.proposePromotion(
      bundle.id,
      'GLOBAL_ENTERPRISE',
      'author_maker_03',
      'Author Maker'
    );

    // Attempt to approve by the same user who made the proposal
    await expect(workflowBundleService.reviewPromotion(
      bundle.id,
      'author_maker_03', // Same as maker!
      'Author Maker',
      'APPROVE'
    )).rejects.toThrow(/Anti-Self-Approval Violation/);
  });

  it('4. Successfully approves bundle promotion when authorized by an independent Checker', async () => {
    const bundle = await workflowBundleService.createBundle({
      name: 'Enterprise Certified Reconciliation',
      workflowId: testWorkflowId,
      sourceTeamId: testTeamId,
      makerId: 'maker_engineer_04',
      makerName: 'Maker Engineer'
    });

    await workflowBundleService.proposePromotion(
      bundle.id,
      'GLOBAL_ENTERPRISE',
      'maker_engineer_04',
      'Maker Engineer'
    );

    // Independent Checker review
    const approved = await workflowBundleService.reviewPromotion(
      bundle.id,
      'checker_supervisor_99',
      'Independent Checker Supervisor',
      'APPROVE',
      'Audit verified and ready for enterprise deployment.'
    );

    expect(approved.status).toBe('APPROVED');
    expect(approved.checkerId).toBe('checker_supervisor_99');
    expect(approved.approvedAt).toBeTruthy();
    expect(approved.checkerFeedback).toContain('ready for enterprise');

    // Verify underlying workflow was elevated to public
    const wfCheck = await queryPg(`SELECT visibility, is_public FROM database_validation_workflows WHERE id = $1`, [testWorkflowId]);
    expect(wfCheck.rows[0].visibility).toBe('public');
    expect(wfCheck.rows[0].is_public).toBe(true);
  });

  it('5. Successfully records rejection feedback on denied bundle promotion', async () => {
    const bundle = await workflowBundleService.createBundle({
      name: 'Defective Rule Bundle',
      workflowId: testWorkflowId,
      sourceTeamId: testTeamId,
      makerId: 'maker_junior_05',
      makerName: 'Junior Maker'
    });

    await workflowBundleService.proposePromotion(
      bundle.id,
      'GLOBAL_ENTERPRISE',
      'maker_junior_05',
      'Junior Maker'
    );

    const rejected = await workflowBundleService.reviewPromotion(
      bundle.id,
      'checker_supervisor_99',
      'Independent Checker Supervisor',
      'REJECT',
      'Missing currency tolerance rules in validation box.'
    );

    expect(rejected.status).toBe('REJECTED');
    expect(rejected.checkerFeedback).toContain('Missing currency tolerance');
  });

  it('6. Segregated Domain Approval Endpoints strictly isolate transaction resolutions from workflow bundles', async () => {
    // 0. Ensure investigation task exists
    await queryPg(`
      INSERT INTO investigation_tasks (id, workflow_id, workflow_name, status)
      VALUES ('task-seg-001', $1, 'Settlement Validation Flow', 'IN_PROGRESS')
      ON CONFLICT (id) DO NOTHING;
    `, [testWorkflowId]);

    // 1. Submit a transaction override
    await approvalService.submitProposal({
      type: 'TRANSACTION_RESOLUTION',
      taskId: 'task-seg-001',
      transactionId: 'TXN-999-OVERRIDE',
      teamId: testTeamId,
      makerId: 'maker_settlement_01',
      makerName: 'Settlement Maker',
      proposedAction: 'FORCE_MATCH',
      justification: 'Manual clearing memo verified with switch.'
    });

    // 2. Query dedicated transaction feed
    const txns = await approvalService.getTransactionApprovals({ teamId: testTeamId });
    expect(txns.length).toBeGreaterThan(0);
    // Every item in transaction approvals MUST be of type TRANSACTION_RESOLUTION
    txns.forEach(item => {
      expect(item.type).toBe('TRANSACTION_RESOLUTION');
    });

    // 3. Query dedicated workflow bundle feed
    const bundles = await approvalService.getWorkflowBundleApprovals({ teamId: testTeamId });
    expect(bundles.length).toBeGreaterThan(0);
    // Every item in workflow bundle approvals MUST be of type WORKFLOW_BUNDLE
    bundles.forEach(item => {
      expect(item.type).toBe('WORKFLOW_BUNDLE');
    });
  });

  afterAll(async () => {
    try {
      await queryPg(`DELETE FROM workspace_setting_proposals WHERE team_id = $1;`, [testTeamId]);
      await queryPg(`DELETE FROM workflow_bundles WHERE source_team_id = $1 OR workflow_id = $2;`, [testTeamId, testWorkflowId]);
      await queryPg(`DELETE FROM investigation_tasks WHERE id = 'task-seg-001';`);
      await queryPg(`DELETE FROM database_validation_workflows WHERE id = $1;`, [testWorkflowId]);
      await queryPg(`DELETE FROM validation_boxes WHERE id = $1;`, [testBoxId]);
      await queryPg(`DELETE FROM database_connections WHERE id LIKE 'team-db-%';`);
      await queryPg(`DELETE FROM teams WHERE id = $1;`, [testTeamId]);
    } catch (err: any) {
      console.warn('Cleanup error in workflowBundleAndGovernanceRefactor:', err.message);
    }
  });
});
