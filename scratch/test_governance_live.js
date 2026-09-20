async function runTests() {
  const BASE_URL = 'http://localhost:5002/api';
  console.log('Testing Live Backend Governance APIs at', BASE_URL);

  const testUserId1 = `test-usr-${Date.now()}-1`;
  const teamAlphaId = `team-perm-alpha-${Date.now()}`;
  const teamBetaId = `team-perm-beta-${Date.now()}`;

  // 1. Create teamAlpha as permanent team with testUserId1
  const res1 = await fetch(`${BASE_URL}/teams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: teamAlphaId,
      name: 'Card Settlement Operations',
      teamType: 'permanent',
      managerId: testUserId1,
      managerName: 'alice_settlement',
      memberIds: [testUserId1],
      allowedDbIds: ['db-1789318844365'],
      allowedQueryTypes: ['SELECT']
    })
  });
  console.log('1. Create permanent teamAlpha:', res1.status, res1.status === 201 ? 'PASS' : 'FAIL');
  const teamAlpha = await res1.json();
  console.log('   allowedDbIds:', teamAlpha.allowedDbIds);
  console.log('   allowedQueryTypes:', teamAlpha.allowedQueryTypes);

  // 2. Reject 2nd permanent team with testUserId1
  const res2 = await fetch(`${BASE_URL}/teams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: teamBetaId,
      name: 'Clearing Operations',
      teamType: 'permanent',
      managerId: 'usr-admin-ops',
      managerName: 'Admin',
      memberIds: [testUserId1]
    })
  });
  console.log('2. Reject dual permanent team membership:', res2.status, res2.status === 400 ? 'PASS (400 as expected)' : 'FAIL');
  const err2 = await res2.json();
  console.log('   Error message:', err2.error);

  // 3. Query Sandbox: Blocks unauthorized query type (UPDATE)
  const res3 = await fetch(`${BASE_URL}/db/query/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: testUserId1,
      username: 'alice_settlement',
      userRole: 'operational',
      dbId: 'db-1789318844365',
      query: "UPDATE transactions SET status = 'DONE' WHERE id = 'tx-1';"
    })
  });
  console.log('3. Block forbidden UPDATE for permanent team:', res3.status, res3.status === 403 ? 'PASS (403 forbidden)' : 'FAIL');
  const err3 = await res3.json();
  console.log('   Error message:', err3.error);

  // 4. Query Sandbox: Allows SELECT query type
  const res4 = await fetch(`${BASE_URL}/db/query/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: testUserId1,
      username: 'alice_settlement',
      userRole: 'operational',
      dbId: 'db-1789318844365',
      query: "SELECT 1 as val;"
    })
  });
  console.log('4. Allow permitted SELECT for permanent team:', res4.status, res4.status !== 403 ? 'PASS' : 'FAIL');

  // Clean up
  await fetch(`${BASE_URL}/teams/${teamAlphaId}`, { method: 'DELETE' });
  console.log('Cleanup completed successfully.');
}

runTests().catch(err => console.error(err));
