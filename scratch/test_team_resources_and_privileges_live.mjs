import assert from 'node:assert';

async function runTests() {
  const BASE_URL = 'http://localhost:5002/api';
  console.log('=== Testing Two-Tier Privileges & Team Resources Governance ===\n');

  const testManagerId = `usr-mgr-${Date.now()}`;
  const testMemberId = `usr-mem-${Date.now()}`;
  const testExternalUserId = `usr-ext-${Date.now()}`;
  const teamId = `team-ops-${Date.now()}`;
  const otherTeamId = `team-other-${Date.now()}`;
  const globalDbId = 'db-1789318844365'; // LocalFTP

  let createdTeamDbId = null;

  try {
    // 1. Create Main Permanent Team
    console.log('1. Creating main permanent team with Manager and Member...');
    const resTeam = await fetch(`${BASE_URL}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: teamId,
        name: 'Cards Settlement Unit',
        teamType: 'permanent',
        managerId: testManagerId,
        managerName: 'manager_sam',
        memberIds: [testManagerId, testMemberId],
        allowedDbIds: [globalDbId],
        allowedQueryTypes: ['SELECT', 'INSERT']
      })
    });
    assert.strictEqual(resTeam.status, 201, 'Expected 201 when creating team');
    console.log('   ✓ Team created successfully with Tier 1 Envelope: DBs=[db-1789318844365], QueryTypes=[SELECT, INSERT]');

    // 2. Create Other Permanent Team for Cross-Team Isolation Testing
    console.log('2. Creating second permanent team for cross-team isolation testing...');
    const resOther = await fetch(`${BASE_URL}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: otherTeamId,
        name: 'Disputes Unit',
        teamType: 'permanent',
        managerId: testExternalUserId,
        managerName: 'external_bob',
        memberIds: [testExternalUserId],
        allowedDbIds: [globalDbId],
        allowedQueryTypes: ['SELECT']
      })
    });
    assert.strictEqual(resOther.status, 201, 'Expected 201 when creating second team');
    console.log('   ✓ Second team created successfully.');

    // 3. Tier 2 Manager Delegation: Valid Allocation
    console.log('3. Testing Manager Privilege Allocation within team envelope...');
    const resAllocValid = await fetch(`${BASE_URL}/teams/${teamId}/member-privileges`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberPrivileges: {
          [testMemberId]: {
            allowedDbIds: [globalDbId],
            allowedQueryTypes: ['SELECT']
          }
        },
        callerUserId: testManagerId,
        callerRole: 'manager'
      })
    });
    assert.strictEqual(resAllocValid.status, 200, 'Expected 200 for valid allocation');
    const validData = await resAllocValid.json();
    assert.deepStrictEqual(validData.team.memberPrivileges[testMemberId], {
      allowedDbIds: [globalDbId],
      allowedQueryTypes: ['SELECT']
    });
    console.log('   ✓ Manager successfully allocated SELECT privileges to team member.');

    // 4. Tier 2 Manager Delegation: Reject DB outside envelope
    console.log('4. Testing Privilege Ceiling Violation on Database...');
    const resCeilingDb = await fetch(`${BASE_URL}/teams/${teamId}/member-privileges`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberPrivileges: {
          [testMemberId]: {
            allowedDbIds: [globalDbId, 'unauthorized-db-999'],
            allowedQueryTypes: ['SELECT']
          }
        },
        callerUserId: testManagerId,
        callerRole: 'manager'
      })
    });
    assert.strictEqual(resCeilingDb.status, 400, 'Expected 400 for DB ceiling violation');
    const ceilingDbErr = await resCeilingDb.json();
    console.log('   ✓ Rejected unauthorized DB allocation with:', ceilingDbErr.error);

    // 5. Tier 2 Manager Delegation: Reject Query Type outside envelope
    console.log('5. Testing Privilege Ceiling Violation on Query Type...');
    const resCeilingType = await fetch(`${BASE_URL}/teams/${teamId}/member-privileges`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberPrivileges: {
          [testMemberId]: {
            allowedDbIds: [globalDbId],
            allowedQueryTypes: ['SELECT', 'DELETE'] // Team only has SELECT and INSERT
          }
        },
        callerUserId: testManagerId,
        callerRole: 'manager'
      })
    });
    assert.strictEqual(resCeilingType.status, 400, 'Expected 400 for Query Type ceiling violation');
    const ceilingTypeErr = await resCeilingType.json();
    console.log('   ✓ Rejected unauthorized Query Type allocation with:', ceilingTypeErr.error);

    // 6. Create Team-Specific Database Connection (Private Scope)
    console.log('6. Creating team-specific external database connection...');
    const resCreateDb = await fetch(`${BASE_URL}/db/team-databases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId,
        userId: testManagerId,
        name: 'Private Reconciliation PostgreSQL',
        type: 'PostgreSQL',
        host: 'localhost',
        port: 5432,
        databaseName: 'reconcile_db',
        description: 'Private team reconciliation connection'
      })
    });
    assert.strictEqual(resCreateDb.status, 201, 'Expected 201 for team database creation');
    const createdDb = await resCreateDb.json();
    assert.strictEqual(createdDb.scope, 'team');
    assert.strictEqual(createdDb.teamId, teamId);
    assert.strictEqual(createdDb.promotionStatus, 'NONE');
    createdTeamDbId = createdDb.id;
    console.log('   ✓ Team-specific database created with ID:', createdTeamDbId, 'scope:', createdDb.scope);

    // 7. GET /api/db/team-databases
    console.log('7. Verifying GET /api/db/team-databases endpoint...');
    const resGetTeamDbs = await fetch(`${BASE_URL}/db/team-databases?teamId=${teamId}`);
    assert.strictEqual(resGetTeamDbs.status, 200);
    const teamDbsList = await resGetTeamDbs.json();
    assert(teamDbsList.some(d => d.id === createdTeamDbId), 'Created team DB should be in list');
    console.log(`   ✓ Retrieved ${teamDbsList.length} team-specific connection(s).`);

    // 8. Cross-Team Resource Isolation in Query Sandbox
    console.log('8. Testing Cross-Team Sandbox Isolation (External User vs Team DB)...');
    const resCrossQuery = await fetch(`${BASE_URL}/db/query/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: testExternalUserId, // Belongs to otherTeamId
        username: 'external_bob',
        userRole: 'operational',
        dbId: createdTeamDbId,
        dbName: 'Private Reconciliation PostgreSQL',
        query: 'SELECT * FROM test_table LIMIT 1'
      })
    });
    assert.strictEqual(resCrossQuery.status, 403, 'Expected 403 Forbidden for cross-team query');
    const crossQueryErr = await resCrossQuery.json();
    console.log('   ✓ Cross-team execution correctly blocked:', crossQueryErr.error);

    // 9. Member-Level Allocated Privilege Enforcement in Query Sandbox
    console.log('9. Testing Member-Level Privilege Enforcement in Query Sandbox...');
    // Member only has SELECT; attempting INSERT should be blocked
    const resMemberInsert = await fetch(`${BASE_URL}/db/query/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: testMemberId,
        username: 'alice_member',
        userRole: 'operational',
        dbId: globalDbId,
        dbName: 'LocalFTP',
        query: "INSERT INTO transactions (id, status) VALUES ('tx-test', 'NEW');"
      })
    });
    assert.strictEqual(resMemberInsert.status, 403, 'Expected 403 Forbidden for unallocated INSERT');
    const memberInsertErr = await resMemberInsert.json();
    console.log('   ✓ Member query type ceiling correctly enforced:', memberInsertErr.error);

    // 10. Manager Requests System-Wide Promotion
    console.log('10. Manager submitting promotion request for system-wide resource...');
    const resReqPromo = await fetch(`${BASE_URL}/db/team-databases/${createdTeamDbId}/request-promotion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requesterId: testManagerId,
        notes: 'Required across enterprise for central AIB settlement audits.'
      })
    });
    assert.strictEqual(resReqPromo.status, 200);
    const promoData = await resReqPromo.json();
    assert.strictEqual(promoData.promotionStatus, 'PENDING_ADMIN_APPROVAL');
    console.log('   ✓ Promotion requested. Status: PENDING_ADMIN_APPROVAL');

    // 11. Admin Monitoring Route
    console.log('11. Workspace Admin inspecting team resources via GET /api/db/admin/team-resources...');
    const resAdminMonitor = await fetch(`${BASE_URL}/db/admin/team-resources`);
    assert.strictEqual(resAdminMonitor.status, 200);
    const adminList = await resAdminMonitor.json();
    const monitoredDb = adminList.find(d => d.id === createdTeamDbId);
    assert(monitoredDb, 'Requested DB should be present in Admin monitoring feed');
    assert.strictEqual(monitoredDb.promotionStatus, 'PENDING_ADMIN_APPROVAL');
    assert.strictEqual(monitoredDb.teamName, 'Cards Settlement Unit');
    console.log('   ✓ Admin Monitor detected resource with team metadata:', monitoredDb.teamName);

    // 12. Workspace Admin Reviews & Approves Promotion
    console.log('12. Workspace Admin reviewing and approving promotion to global scope...');
    const resReview = await fetch(`${BASE_URL}/db/team-databases/${createdTeamDbId}/review-promotion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'APPROVE',
        reviewerId: 'usr-admin-ops',
        notes: 'Verified socket connectivity and approved for system-wide operations.'
      })
    });
    assert.strictEqual(resReview.status, 200);
    const approvedDb = await resReview.json();
    assert.strictEqual(approvedDb.scope, 'global');
    assert.strictEqual(approvedDb.promotionStatus, 'APPROVED');
    console.log('   ✓ Connection promoted to global scope! Scope:', approvedDb.scope, 'Status:', approvedDb.promotionStatus);

    console.log('\n========================================');
    console.log('🎉 ALL 12 INTEGRATION TESTS PASSED CLEANLY!');
    console.log('========================================\n');
  } finally {
    // Cleanup test data
    console.log('Cleaning up test entities...');
    if (createdTeamDbId) {
      await fetch(`${BASE_URL}/db/databases/${createdTeamDbId}`, { method: 'DELETE' }).catch(() => {});
    }
    await fetch(`${BASE_URL}/teams/${teamId}`, { method: 'DELETE' }).catch(() => {});
    await fetch(`${BASE_URL}/teams/${otherTeamId}`, { method: 'DELETE' }).catch(() => {});
    console.log('Cleanup completed.');
  }
}

runTests().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
