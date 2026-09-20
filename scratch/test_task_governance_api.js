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

async function runTaskTests() {
  console.log('--- TEST A: CREATE TEAM TASK WITH VISIBILITY ---');
  const taskPayload = {
    teamId: 'team-cards',
    title: 'Verify Visa Settlement File Format',
    description: 'Check column headers match the newly defined schema',
    status: 'IN_PROGRESS',
    priority: 'HIGH',
    assignedToId: 'usr-1',
    assignedToName: 'Alice Operator',
    isPublic: true,
    visibility: 'team'
  };

  const createTaskRes = await request({
    hostname: 'localhost',
    port: 5002,
    path: '/api/teams/tasks',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, taskPayload);
  console.log('Status:', createTaskRes.status);
  console.log('Created Task ID:', createTaskRes.data?.id);
  console.log('Task isPublic:', createTaskRes.data?.isPublic);
  console.log('Task visibility:', createTaskRes.data?.visibility);
  const taskId = createTaskRes.data?.id;
  if (createTaskRes.status !== 201 || !taskId || createTaskRes.data?.isPublic !== true) {
    throw new Error('Test A failed: Task creation with visibility failed');
  }

  console.log('\n--- TEST B: INVALID TASK ESCALATION ---');
  const invalidEscalateRes = await request({
    hostname: 'localhost',
    port: 5002,
    path: `/api/teams/tasks/${taskId}/escalate`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    targetTeamId: 'unauthorized-external-team',
    escalationReason: 'Arbitrary escalation'
  });
  console.log('Status:', invalidEscalateRes.status, '(Expected 400 Bad Request)');
  console.log('Error:', invalidEscalateRes.data?.error);
  if (invalidEscalateRes.status !== 400) {
    throw new Error('Test B failed: Arbitrary task escalation was NOT rejected');
  }

  console.log('\n--- TEST C: VALID TASK ESCALATION VIA MATRIX ---');
  const validEscalateRes = await request({
    hostname: 'localhost',
    port: 5002,
    path: `/api/teams/tasks/${taskId}/escalate`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, {
    targetTeamId: 'team-parent-ops',
    escalationReason: 'Escalated for senior operations clearance'
  });
  console.log('Status:', validEscalateRes.status, '(Expected 200 OK)');
  console.log('Escalated To:', validEscalateRes.data?.escalatedToTeamId);
  console.log('Escalation Reason:', validEscalateRes.data?.escalationReason);
  if (validEscalateRes.status !== 200 || validEscalateRes.data?.escalatedToTeamId !== 'team-parent-ops') {
    throw new Error('Test C failed: Valid task escalation failed');
  }

  console.log('\n✅ ALL TASK VISIBILITY & MATRIX ESCALATION TESTS PASSED PERFECTLY!');
}

runTaskTests().catch(err => {
  console.error('❌ Task test failed:', err);
  process.exit(1);
});
