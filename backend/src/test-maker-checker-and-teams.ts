/**
 * Test Suite: Maker-Checker Dual Authorization & Team Resolution Governance
 */

import { makerCheckerService } from './services/makerCheckerService.js';
import { connectPostgres } from './config/postgres.js';
import { seedPostgres } from './config/seedPostgres.js';

async function runMakerCheckerTests() {
  console.log('================================================================');
  console.log('STARTING MAKER-CHECKER DUAL AUTHORIZATION TESTS');
  console.log('================================================================\n');

  await connectPostgres();
  await seedPostgres();

  const taskId = 'TASK-TEST-MC-101';
  const transactionId = 'TXN-9090';
  const teamId = 'team-settlement-01';
  const makerId = 'user-maker-001';
  const makerName = 'Alex Analyst (Maker)';
  const checkerId = 'user-checker-002';
  const checkerName = 'Sarah Supervisor (Checker)';

  // Insert prerequisite task & transaction
  const pool = (await import('./config/postgres.js')).getPostgresPool();
  await pool.query(
    `INSERT INTO investigation_tasks (id, workflow_id, status, created_at)
     VALUES ($1, 'wf-test-01', 'IN_PROGRESS', NOW())
     ON CONFLICT (id) DO NOTHING;`,
    [taskId]
  );
  await pool.query(
    `INSERT INTO investigation_transactions (id, task_id, transaction_id, batch_id, investigation_status, final_result, updated_at)
     VALUES ($1, $2, $3, NULL, 'FLAGGED_DISCREPANCY', 'FAIL', NOW())
     ON CONFLICT (id) DO NOTHING;`,
    [`itx-${taskId}-${transactionId}`, taskId, transactionId]
  );

  let proposalId = '';

  // 1. Submit Resolution Proposal (Maker)
  console.log('--- TEST 1: Maker Submits Proposal ---');
  try {
    const proposal = await makerCheckerService.submitResolutionProposal({
      taskId,
      transactionId,
      teamId,
      makerId,
      makerName,
      proposedAction: 'FORCE_MATCH',
      proposedStatus: 'VERIFIED_MATCH',
      justificationNote: 'Matched against CBS host authorization log after manual inspection.',
      evidenceSnapshot: { cbs_auth_code: 'AUTH8872', amount: 100.0 }
    });

    proposalId = proposal.id;
    console.log(`  ✓ PASS: Submitted proposal ${proposal.id} (Status: ${proposal.status})`);
  } catch (err: any) {
    console.error(`  ✗ FAIL: Proposal submission error: ${err.message}`);
    process.exit(1);
  }

  // 2. Anti-Self-Approval Enforcement (Maker attempts self-approval)
  console.log('\n--- TEST 2: Anti-Self-Approval Enforcement ---');
  try {
    await makerCheckerService.reviewResolutionProposal({
      requestId: proposalId,
      checkerId: makerId, // Self-approval attempt
      checkerName: makerName,
      checkerTeamId: teamId,
      action: 'APPROVE'
    });
    console.error('  ✗ FAIL: Self-approval should have been blocked!');
    process.exit(1);
  } catch (err: any) {
    if (err.message.includes('Anti-Self-Approval')) {
      console.log(`  ✓ PASS: Self-approval correctly blocked: ${err.message}`);
    } else {
      console.error(`  ✗ FAIL: Unexpected error: ${err.message}`);
      process.exit(1);
    }
  }

  // 3. Team Pending Queue Lookup
  console.log('\n--- TEST 3: Team Pending Queue Lookup ---');
  try {
    const pending = await makerCheckerService.getTeamPendingResolutions(teamId);
    if (pending.some(p => p.id === proposalId)) {
      console.log(`  ✓ PASS: Pending queue contains proposal ${proposalId} for team ${teamId}`);
    } else {
      console.error(`  ✗ FAIL: Proposal ${proposalId} not found in pending queue`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`  ✗ FAIL: Pending queue error: ${err.message}`);
    process.exit(1);
  }

  // 4. Supervisor Review & Approval (Checker)
  console.log('\n--- TEST 4: Supervisor Approval ---');
  try {
    const approved = await makerCheckerService.reviewResolutionProposal({
      requestId: proposalId,
      checkerId,
      checkerName,
      checkerTeamId: teamId,
      action: 'APPROVE'
    });

    if (approved.status === 'APPROVED' && approved.checkerId === checkerId) {
      console.log(`  ✓ PASS: Proposal ${approved.id} successfully approved by Supervisor ${approved.checkerName}`);
    } else {
      console.error(`  ✗ FAIL: Approval status unexpected: ${JSON.stringify(approved)}`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`  ✗ FAIL: Approval error: ${err.message}`);
    process.exit(1);
  }

  // 5. Universal Hashtag Binding Resolution
  console.log('\n--- TEST 5: Universal Hashtag Binding Resolution ---');
  try {
    const { hashtagService } = await import('./services/hashtagService.js');
    const resolved = await hashtagService.resolveHashtagAssets('settlement');
    if (resolved && resolved.tag === '#settlement') {
      console.log(`  ✓ PASS: Resolved hashtag assets for ${resolved.tag} (${resolved.workflows.length} workflows, ${resolved.ftpConfigs.length} FTP configs)`);
    } else {
      console.error('  ✗ FAIL: Hashtag resolution returned invalid object');
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`  ✗ FAIL: Hashtag resolution error: ${err.message}`);
    process.exit(1);
  }

  console.log('\n================================================================');
  console.log('ALL MAKER-CHECKER & HASHTAG TESTS PASSED SUCCESSFULLY (100%)');
  console.log('================================================================');
  process.exit(0);
}

runMakerCheckerTests().catch(err => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
