import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Team Database Access & Permanent Team Membership Governance', () => {
  const BASE_URL = 'http://localhost:5002/api';

  const testUserId1 = `test-usr-${Date.now()}-1`;
  const testUserId2 = `test-usr-${Date.now()}-2`;
  const teamAlphaId = `team-perm-alpha-${Date.now()}`;
  const teamBetaId = `team-perm-beta-${Date.now()}`;
  const teamGammaId = `team-working-gamma-${Date.now()}`;

  const authorizedDbId = 'db-1789318844365'; // LocalFTP
  const unauthorizedDbId = 'db-1788895559870'; // Sett

  beforeAll(async () => {
    // 1. Create permTeamA via API so it exists in PostgreSQL and the server
    const res = await fetch(`${BASE_URL}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: teamAlphaId,
        name: 'Card Settlement Operations',
        teamType: 'permanent',
        managerId: testUserId1,
        managerName: 'alice_settlement',
        memberIds: [testUserId1],
        allowedDbIds: [authorizedDbId],
        allowedQueryTypes: ['SELECT']
      })
    });
    expect(res.status).toBe(201);
  });

  afterAll(async () => {
    await fetch(`${BASE_URL}/teams/${teamAlphaId}`, { method: 'DELETE' }).catch(() => {});
    await fetch(`${BASE_URL}/teams/${teamBetaId}`, { method: 'DELETE' }).catch(() => {});
    await fetch(`${BASE_URL}/teams/${teamGammaId}`, { method: 'DELETE' }).catch(() => {});
  });

  describe('1. Single Permanent Team Invariant Enforcement', () => {
    it('rejects creating a second permanent team with a user already in a permanent team', async () => {
      const res = await fetch(`${BASE_URL}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: teamBetaId,
          name: 'Dispute Investigation Permanent Unit',
          teamType: 'permanent',
          managerId: 'usr-admin-ops',
          managerName: 'Admin',
          memberIds: [testUserId1] // alice is already in teamAlphaId!
        })
      });

      const body = await res.json();
      expect(res.status).toBe(400);
      expect(body.error).toContain('already a member of permanent team "Card Settlement Operations"');
      expect(body.error).toContain('A user can only belong to one permanent team');
    });

    it('rejects updating an existing permanent team to include a user from another permanent team', async () => {
      // Create independent permanent team with user 2
      const resCreate = await fetch(`${BASE_URL}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: teamBetaId,
          name: 'Clearing Operations',
          teamType: 'permanent',
          managerId: testUserId2,
          managerName: 'bob_reconciliation',
          memberIds: [testUserId2]
        })
      });
      expect(resCreate.status).toBe(201);

      // Attempt to add user 1 (from teamAlphaId) into teamBetaId
      const resUpdate = await fetch(`${BASE_URL}/teams/${teamBetaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberIds: [testUserId2, testUserId1]
        })
      });

      const body = await resUpdate.json();
      expect(resUpdate.status).toBe(400);
      expect(body.error).toContain('already a member of permanent team "Card Settlement Operations"');
    });

    it('allows a user to belong to working / cross-functional squads alongside their permanent team', async () => {
      const res = await fetch(`${BASE_URL}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: teamGammaId,
          name: 'Year-End Audit Working Squad',
          teamType: 'working',
          managerId: testUserId1,
          managerName: 'alice_settlement',
          memberIds: [testUserId1, testUserId2]
        })
      });

      const body = await res.json();
      expect(res.status).toBe(201);
      expect(body.id).toBe(teamGammaId);
      expect(body.teamType).toBe('working');
    });
  });

  describe('2. Team Database Access & Query Type Enforcement in Query Sandbox', () => {
    it('blocks query execution if user has no permanent team membership', async () => {
      const res = await fetch(`${BASE_URL}/db/query/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'usr-rogue-no-team',
          username: 'rogue_user',
          userRole: 'operational',
          dbId: authorizedDbId,
          query: 'SELECT 1;'
        })
      });

      const body = await res.json();
      expect(res.status).toBe(403);
      expect(body.error).toContain('Access Denied: You must be an active member of an authorized permanent team');
    });

    it('blocks query execution if permanent team is not authorized to access the requested database', async () => {
      const res = await fetch(`${BASE_URL}/db/query/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: testUserId1,
          username: 'alice_settlement',
          userRole: 'operational',
          dbId: unauthorizedDbId,
          query: 'SELECT 1;'
        })
      });

      const body = await res.json();
      expect(res.status).toBe(403);
      expect(body.error).toContain('is not authorized to access database "Sett"');
    });

    it('blocks UPDATE execution when permanent team only permits SELECT queries', async () => {
      const res = await fetch(`${BASE_URL}/db/query/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: testUserId1,
          username: 'alice_settlement',
          userRole: 'operational',
          dbId: authorizedDbId,
          query: "UPDATE transactions SET status = 'DONE' WHERE id = 'tx-1';"
        })
      });

      const body = await res.json();
      expect(res.status).toBe(403);
      expect(body.error).toContain('Query Execution Forbidden: Permanent team "Card Settlement Operations" only permits query types: [SELECT]');
      expect(body.error).toContain('Attempted operation: "UPDATE"');
    });

    it('allows query execution when permanent team has been granted the required query type', async () => {
      // Grant UPDATE to teamAlpha
      const updateRes = await fetch(`${BASE_URL}/teams/${teamAlphaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allowedQueryTypes: ['SELECT', 'UPDATE']
        })
      });
      expect(updateRes.status).toBe(200);

      const res = await fetch(`${BASE_URL}/db/query/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: testUserId1,
          username: 'alice_settlement',
          userRole: 'operational',
          dbId: authorizedDbId,
          query: 'SELECT 1 as result;'
        })
      });

      expect(res.status).not.toBe(403);
    });
  });
});
