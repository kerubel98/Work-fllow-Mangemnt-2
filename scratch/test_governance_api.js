const http = require('http');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runTests() {
  console.log('--- TEST 1: GET ESCALATION MATRIX ---');
  const matrixRes = await request({
    hostname: 'localhost',
    port: 5002,
    path: '/api/teams/team-cards/escalation-matrix',
    method: 'GET'
  });
  console.log('Status:', matrixRes.status);
  console.log('Matrix targets count:', Array.isArray(matrixRes.data) ? matrixRes.data.length : 0);
  console.log('Target item:', JSON.stringify(matrixRes.data[0]));
  if (matrixRes.status !== 200 || !Array.isArray(matrixRes.data) || matrixRes.data.length === 0) {
    throw new Error('Test 1 failed: matrix target not found');
  }

  console.log('\n--- TEST 2: CREATE WORKSPACE SETTING PROPOSAL (MAKER) ---');
  const proposalPayload = {
    teamId: 'team-cards',
    settingType: 'WORKSPACE_CONFIG',
    settingKey: 'workspace_config',
    title: 'E2E Verification: Update SLA Policy',
    justification: 'Card settlements require tightened SLA for compliance audit 2026',
    proposedChanges: { slaCriticalHours: 2, autoAssignNewCases: true },
    makerId: 'maker-user-1',
    makerName: 'Maker Alice'
  };
  const createRes = await request({
    hostname: 'localhost',
    port: 5002,
    path: '/api/settings/proposals',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, proposalPayload);
  console.log('Status:', createRes.status);
  console.log('Created Proposal ID:', createRes.data?.id);
  console.log('Initial Status:', createRes.data?.status);
  const proposalId = createRes.data?.id;
  if (createRes.status !== 201 || !proposalId) {
    throw new Error('Test 2 failed: proposal creation failed');
  }

  console.log('\n--- TEST 3: ANTI-SELF-APPROVAL ENFORCEMENT ---');
  const selfApproveRes = await request({
    hostname: 'localhost',
    port: 5002,
    path: `/api/settings/proposals/${proposalId}/review`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    action: 'APPROVE',
    checkerId: 'maker-user-1', // SAME AS MAKER!
    checkerName: 'Maker Alice'
  });
  console.log('Status:', selfApproveRes.status, '(Expected 403 Forbidden)');
  console.log('Response message:', selfApproveRes.data?.error || selfApproveRes.data);
  if (selfApproveRes.status !== 403) {
    throw new Error('Test 3 failed: Anti-Self-Approval was NOT enforced!');
  }

  console.log('\n--- TEST 4: INVALID ESCALATION ENFORCEMENT ---');
  const invalidEscalateRes = await request({
    hostname: 'localhost',
    port: 5002,
    path: `/api/settings/proposals/${proposalId}/escalate`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    targetTeamId: 'unauthorized-target-team',
    reason: 'Trying to bypass matrix',
    escalatedBy: 'maker-user-1',
    escalatedByName: 'Maker Alice'
  });
  console.log('Status:', invalidEscalateRes.status, '(Expected 400 Bad Request)');
  console.log('Response error:', invalidEscalateRes.data?.error);
  if (invalidEscalateRes.status !== 400) {
    throw new Error('Test 4 failed: Arbitrary escalation was NOT rejected!');
  }

  console.log('\n--- TEST 5: VALID MATRIX ESCALATION ---');
  const validEscalateRes = await request({
    hostname: 'localhost',
    port: 5002,
    path: `/api/settings/proposals/${proposalId}/escalate`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    targetTeamId: 'team-parent-ops',
    reason: 'Requires operational head authorization',
    escalatedBy: 'maker-user-1',
    escalatedByName: 'Maker Alice'
  });
  console.log('Status:', validEscalateRes.status, '(Expected 200 OK)');
  console.log('New Status:', validEscalateRes.data?.status);
  console.log('Target Team:', validEscalateRes.data?.escalatedTeamId || validEscalateRes.data?.targetTeamId);
  const escStatus = validEscalateRes.data?.status;
  if (validEscalateRes.status !== 200 || (escStatus !== 'ESCALATED' && escStatus !== 'ESCALATED_TO_TARGET_TEAM')) {
    throw new Error('Test 5 failed: Valid escalation failed!');
  }

  console.log('\n--- TEST 6: CHECKER REVIEW & APPROVAL ---');
  const checkerApproveRes = await request({
    hostname: 'localhost',
    port: 5002,
    path: `/api/settings/proposals/${proposalId}/review`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    action: 'APPROVE',
    checkerId: 'checker-bob-2',
    checkerName: 'Checker Bob',
    feedback: 'Approved after verifying audit requirements.'
  });
  console.log('Status:', checkerApproveRes.status, '(Expected 200 OK)');
  console.log('Final Status:', checkerApproveRes.data?.status);
  console.log('Checker Name:', checkerApproveRes.data?.checkerName);
  if (checkerApproveRes.status !== 200 || checkerApproveRes.data?.status !== 'APPROVED') {
    throw new Error('Test 6 failed: Checker approval failed!');
  }

  console.log('\n✅ ALL GOVERNANCE & ESCALATION TESTS PASSED PERFECTLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
