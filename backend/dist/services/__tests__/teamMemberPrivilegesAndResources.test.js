import { describe, it, expect, beforeAll, afterAll } from 'vitest';
describe('Two-Tier External System Privileges & Team Resources Governance', () => {
    const BASE_URL = 'http://localhost:5002/api';
    const testManagerId = `usr-mgr-${Date.now()}`;
    const testMemberId = `usr-mem-${Date.now()}`;
    const testExternalUserId = `usr-ext-${Date.now()}`;
    const teamId = `team-ops-${Date.now()}`;
    const otherTeamId = `team-other-${Date.now()}`;
    const globalDbId = 'db-1789318844365'; // Known existing global DB
    let createdTeamDbId;
    beforeAll(async () => {
        // 1. Create main permanent team with Manager and Member
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
        expect(resTeam.status).toBe(201);
        // 2. Create another permanent team for testing cross-team isolation
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
        expect(resOther.status).toBe(201);
    });
    afterAll(async () => {
        if (createdTeamDbId) {
            await fetch(`${BASE_URL}/db/databases/${createdTeamDbId}`, { method: 'DELETE' }).catch(() => { });
        }
        await fetch(`${BASE_URL}/teams/${teamId}`, { method: 'DELETE' }).catch(() => { });
        await fetch(`${BASE_URL}/teams/${otherTeamId}`, { method: 'DELETE' }).catch(() => { });
    });
    describe('1. Tier 2: Manager Delegation & Strict Privilege Ceiling', () => {
        it('allows Manager to allocate privileges within the team envelope', async () => {
            const res = await fetch(`${BASE_URL}/teams/${teamId}/member-privileges`, {
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
            const body = await res.json();
            expect(res.status).toBe(200);
            expect(body.success).toBe(true);
            expect(body.team.memberPrivileges[testMemberId]).toEqual({
                allowedDbIds: [globalDbId],
                allowedQueryTypes: ['SELECT']
            });
        });
        it('rejects allocating a database that the team does NOT have in its envelope (Ceiling Violation)', async () => {
            const res = await fetch(`${BASE_URL}/teams/${teamId}/member-privileges`, {
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
            const body = await res.json();
            expect(res.status).toBe(400);
            expect(body.error).toContain('Privilege ceiling violation');
            expect(body.error).toContain('unauthorized-db-999');
        });
        it('rejects allocating a query statement type that the team does NOT have in its envelope (Ceiling Violation)', async () => {
            const res = await fetch(`${BASE_URL}/teams/${teamId}/member-privileges`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    memberPrivileges: {
                        [testMemberId]: {
                            allowedDbIds: [globalDbId],
                            allowedQueryTypes: ['SELECT', 'DELETE'] // Team only has SELECT, INSERT
                        }
                    },
                    callerUserId: testManagerId,
                    callerRole: 'manager'
                })
            });
            const body = await res.json();
            expect(res.status).toBe(400);
            expect(body.error).toContain('Privilege ceiling violation');
            expect(body.error).toContain('DELETE');
        });
    });
    describe('2. Team-Specific Database Creation & Cross-Team Isolation', () => {
        it('creates a team-scoped connection isolated to the team', async () => {
            const res = await fetch(`${BASE_URL}/db/team-databases`, {
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
                    description: 'Team internal reconciliation mirror'
                })
            });
            const body = await res.json();
            expect(res.status).toBe(201);
            expect(body.scope).toBe('team');
            expect(body.teamId).toBe(teamId);
            expect(body.promotionStatus).toBe('NONE');
            createdTeamDbId = body.id;
        });
        it('retrieves team-specific databases via dedicated GET /api/db/team-databases', async () => {
            const res = await fetch(`${BASE_URL}/db/team-databases?teamId=${teamId}`);
            const body = await res.json();
            expect(res.status).toBe(200);
            expect(Array.isArray(body)).toBe(true);
            expect(body.some((d) => d.id === createdTeamDbId)).toBe(true);
        });
        it('blocks users from other teams from executing queries against team-scoped databases', async () => {
            const res = await fetch(`${BASE_URL}/db/query/execute`, {
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
            const body = await res.json();
            expect(res.status).toBe(403);
            expect(body.error).toContain('Access Denied: Team-specific database');
            expect(body.error).toContain('is private to its designated team');
        });
    });
    describe('3. Team Manager Promotion Workflow & Admin Monitor', () => {
        it('allows Manager to submit promotion request for system-wide promotion', async () => {
            const res = await fetch(`${BASE_URL}/db/team-databases/${createdTeamDbId}/request-promotion`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requesterId: testManagerId,
                    notes: 'Required across all teams for quarterly dispute reconciliation.'
                })
            });
            const body = await res.json();
            expect(res.status).toBe(200);
            expect(body.promotionStatus).toBe('PENDING_ADMIN_APPROVAL');
            expect(body.promotionNotes).toContain('quarterly dispute reconciliation');
        });
        it('surfaces pending team resources on Admin monitoring endpoint GET /api/db/admin/team-resources', async () => {
            const res = await fetch(`${BASE_URL}/db/admin/team-resources`);
            const body = await res.json();
            expect(res.status).toBe(200);
            expect(Array.isArray(body)).toBe(true);
            const monitored = body.find((d) => d.id === createdTeamDbId);
            expect(monitored).toBeDefined();
            expect(monitored.promotionStatus).toBe('PENDING_ADMIN_APPROVAL');
            expect(monitored.teamName).toBe('Cards Settlement Unit');
        });
        it('allows Workspace Admin to approve promotion, converting connection to global scope', async () => {
            const res = await fetch(`${BASE_URL}/db/team-databases/${createdTeamDbId}/review-promotion`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'APPROVE',
                    reviewerId: 'usr-admin-ops',
                    notes: 'Verified socket connectivity and approved for enterprise use.'
                })
            });
            const body = await res.json();
            expect(res.status).toBe(200);
            expect(body.scope).toBe('global');
            expect(body.promotionStatus).toBe('APPROVED');
            expect(body.promotionNotes).toContain('Verified socket connectivity');
        });
    });
});
