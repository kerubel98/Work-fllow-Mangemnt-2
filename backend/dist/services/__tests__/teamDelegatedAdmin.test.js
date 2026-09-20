import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolveUserAdminCapabilities } from '../../utils/capabilityHelper.js';
describe('Team Delegated Administration & Operational Governance', () => {
    const BASE_URL = 'http://localhost:5002/api';
    const adminUserId = `usr-admin-${Date.now()}`;
    const dbaUserId = `usr-dba-${Date.now()}`;
    const opsUserId = `usr-ops-${Date.now()}`;
    const regularUserId = `usr-reg-${Date.now()}`;
    const dbaTeamId = `team-dba-${Date.now()}`;
    const opsTeamId = `team-ops-${Date.now()}`;
    let createdDbId = null;
    let createdConfigId = null;
    beforeAll(async () => {
        // 1. Create DB Team
        const resDbaTeam = await fetch(`${BASE_URL}/teams`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: dbaTeamId,
                name: 'Core Database DBA Team',
                teamType: 'permanent',
                managerId: dbaUserId,
                managerName: 'dba_lead',
                memberIds: [dbaUserId],
                allowedDbIds: [],
                allowedQueryTypes: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER']
            })
        });
        expect(resDbaTeam.status).toBe(201);
        // 2. Create Ops Team
        const resOpsTeam = await fetch(`${BASE_URL}/teams`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: opsTeamId,
                name: 'Payment Settlement Ops Team',
                teamType: 'permanent',
                managerId: opsUserId,
                managerName: 'ops_lead',
                memberIds: [opsUserId],
                allowedDbIds: [],
                allowedQueryTypes: ['SELECT']
            })
        });
        expect(resOpsTeam.status).toBe(201);
    });
    afterAll(async () => {
        if (createdConfigId) {
            await fetch(`${BASE_URL}/db/column-configurations/${createdConfigId}`, {
                method: 'DELETE',
                headers: { 'x-user-id': opsUserId }
            }).catch(() => { });
        }
        if (createdDbId) {
            await fetch(`${BASE_URL}/db/databases/${createdDbId}`, {
                method: 'DELETE',
                headers: { 'x-user-id': adminUserId, 'x-user-role': 'admin' }
            }).catch(() => { });
        }
        await fetch(`${BASE_URL}/teams/${dbaTeamId}`, { method: 'DELETE' }).catch(() => { });
        await fetch(`${BASE_URL}/teams/${opsTeamId}`, { method: 'DELETE' }).catch(() => { });
    });
    describe('1. Capability Resolution Helper Unit Tests', () => {
        it('grants all capabilities to global admin regardless of team privileges', async () => {
            const caps = await resolveUserAdminCapabilities(adminUserId, 'admin');
            expect(caps.isGlobalAdmin).toBe(true);
            expect(caps.canManageConnections).toBe(true);
            expect(caps.canViewMonitoring).toBe(true);
            expect(caps.canManageAccessRequests).toBe(true);
            expect(caps.canManageColumnMapping).toBe(true);
            expect(caps.canManageUsers).toBe(true);
        });
        it('returns default restricted capabilities for unaffiliated user', async () => {
            const caps = await resolveUserAdminCapabilities(regularUserId, 'user');
            expect(caps.isGlobalAdmin).toBe(false);
            expect(caps.canManageConnections).toBe(false);
            expect(caps.canViewMonitoring).toBe(false);
            expect(caps.canManageAccessRequests).toBe(false);
            expect(caps.canManageColumnMapping).toBe(true); // default user can map
            expect(caps.canManageUsers).toBe(false);
        });
    });
    describe('2. Admin Granting Delegated Privileges to Teams', () => {
        it('rejects non-admin from updating team admin privileges', async () => {
            const res = await fetch(`${BASE_URL}/teams/${dbaTeamId}/admin-privileges`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': dbaUserId,
                    'x-user-role': 'user'
                },
                body: JSON.stringify({
                    adminPrivileges: {
                        canManageConnections: true,
                        canViewMonitoring: true
                    }
                })
            });
            expect(res.status).toBe(403);
        });
        it('allows Admin to grant DBA Preset privileges to DB team', async () => {
            const res = await fetch(`${BASE_URL}/teams/${dbaTeamId}/admin-privileges`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': adminUserId,
                    'x-user-role': 'admin'
                },
                body: JSON.stringify({
                    adminPrivileges: {
                        canManageConnections: true,
                        canViewMonitoring: true,
                        canManageAccessRequests: true,
                        canManageColumnMapping: false, // strictly forbidden for DB team
                        canManageUsers: false
                    }
                })
            });
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.team.adminPrivileges.canManageConnections).toBe(true);
            expect(data.team.adminPrivileges.canManageColumnMapping).toBe(false);
        });
        it('allows Admin to grant Ops Preset privileges to Operational team', async () => {
            const res = await fetch(`${BASE_URL}/teams/${opsTeamId}/admin-privileges`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': adminUserId,
                    'x-user-role': 'admin'
                },
                body: JSON.stringify({
                    adminPrivileges: {
                        canManageConnections: false,
                        canViewMonitoring: true,
                        canManageAccessRequests: false,
                        canManageColumnMapping: true, // granted to Ops team
                        canManageUsers: false
                    }
                })
            });
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.team.adminPrivileges.canManageConnections).toBe(false);
            expect(data.team.adminPrivileges.canManageColumnMapping).toBe(true);
        });
        it('resolves DB team capabilities accurately after delegation', async () => {
            const caps = await resolveUserAdminCapabilities(dbaUserId, 'user');
            expect(caps.isGlobalAdmin).toBe(false);
            expect(caps.canManageConnections).toBe(true);
            expect(caps.canViewMonitoring).toBe(true);
            expect(caps.canManageAccessRequests).toBe(true);
            expect(caps.canManageColumnMapping).toBe(false); // strictly false
            expect(caps.canManageUsers).toBe(false);
        });
        it('resolves Ops team capabilities accurately after delegation', async () => {
            const caps = await resolveUserAdminCapabilities(opsUserId, 'user');
            expect(caps.isGlobalAdmin).toBe(false);
            expect(caps.canManageConnections).toBe(false);
            expect(caps.canViewMonitoring).toBe(true);
            expect(caps.canManageAccessRequests).toBe(false);
            expect(caps.canManageColumnMapping).toBe(true);
            expect(caps.canManageUsers).toBe(false);
        });
    });
    describe('3. Separation of Responsibilities in API Endpoints', () => {
        it('allows DB team member to create a database connection', async () => {
            const res = await fetch(`${BASE_URL}/db/databases`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': dbaUserId,
                    'x-user-role': 'user'
                },
                body: JSON.stringify({
                    name: 'Core Settlement DB',
                    type: 'PostgreSQL',
                    host: '127.0.0.1',
                    port: 5432,
                    databaseName: 'cbs_core_db',
                    username: 'postgres',
                    status: 'online',
                    allowedTables: ['transactions', 'settlement_batches']
                })
            });
            expect(res.status).toBe(201);
            const data = await res.json();
            expect(data.id).toBeDefined();
            createdDbId = data.id;
        });
        it('rejects Ops team member from creating a database connection', async () => {
            const res = await fetch(`${BASE_URL}/db/databases`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': opsUserId,
                    'x-user-role': 'user'
                },
                body: JSON.stringify({
                    name: 'Unauthorized Ops DB',
                    type: 'PostgreSQL',
                    host: '127.0.0.1',
                    port: 5432,
                    databaseName: 'illegal_db',
                    username: 'postgres'
                })
            });
            expect(res.status).toBe(403);
            const err = await res.json();
            expect(err.error).toMatch(/database connections/i);
        });
        it('allows DB team member to allocate the connection to Ops team', async () => {
            expect(createdDbId).toBeDefined();
            const res = await fetch(`${BASE_URL}/teams/${opsTeamId}/allocated-databases`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': dbaUserId,
                    'x-user-role': 'user'
                },
                body: JSON.stringify({
                    allowedDbIds: [createdDbId]
                })
            });
            expect(res.status).toBe(200);
            const data = await res.json();
            expect(data.team.allowedDbIds).toContain(createdDbId);
        });
        it('STRICT GOVERNANCE: blocks DB team member from creating column configuration', async () => {
            expect(createdDbId).toBeDefined();
            const res = await fetch(`${BASE_URL}/db/column-configurations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': dbaUserId,
                    'x-user-role': 'user'
                },
                body: JSON.stringify({
                    name: 'Illegal DBA Mapping Rule',
                    dbId: createdDbId,
                    tableName: 'transactions',
                    ruleType: 'DUPLICATE_CHECK',
                    priorityColumns: ['tx_ref'],
                    severity: 'CRITICAL',
                    violationAction: 'FLAG'
                })
            });
            expect(res.status).toBe(403);
            const err = await res.json();
            expect(err.error).toMatch(/Operational Governance Team/i);
        });
        it('allows Ops team member to configure column mapping on allocated DB', async () => {
            expect(createdDbId).toBeDefined();
            const res = await fetch(`${BASE_URL}/db/column-configurations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': opsUserId,
                    'x-user-role': 'user'
                },
                body: JSON.stringify({
                    name: 'Ops Duplicate Tx Check',
                    dbId: createdDbId,
                    tableName: 'transactions',
                    ruleType: 'DUPLICATE_CHECK',
                    priorityColumns: ['tx_ref'],
                    severity: 'HIGH',
                    violationAction: 'FLAG'
                })
            });
            expect(res.status).toBe(201);
            const data = await res.json();
            expect(data.id).toBeDefined();
            createdConfigId = data.id;
        });
    });
});
