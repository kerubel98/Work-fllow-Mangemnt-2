import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getVerifiedActor } from '../../utils/auth.js';

describe('Governance Misalignments Remediation (AUD-GOV-001..005)', () => {
  describe('getVerifiedActor Trust Boundary & Anti-Spoofing (AUD-GOV-002)', () => {
    it('strictly derives actor identity and role from verified req.user JWT session', () => {
      const mockReq = {
        user: {
          id: 'usr-analyst-1',
          username: 'analyst1',
          role: 'analyst',
          email: 'analyst@ops.com',
          teamId: 'team-ops-a'
        },
        headers: {
          'x-user-role': 'admin',
          'x-user-id': 'usr-admin-root'
        },
        body: {
          callerRole: 'admin',
          callerUserId: 'usr-admin-root',
          userRole: 'system_admin',
          checkerId: 'usr-checker-boss'
        },
        query: {
          callerRole: 'admin',
          userId: 'usr-admin-root'
        }
      };

      const actor = getVerifiedActor(mockReq);

      expect(actor.id).toBe('usr-analyst-1');
      expect(actor.role).toBe('analyst');
      expect(actor.username).toBe('analyst1');
      expect(actor.email).toBe('analyst@ops.com');
      expect(actor.teamId).toBe('team-ops-a');
      // Verify spoofed values in headers, body, and query are completely ignored
      expect(actor.role).not.toBe('admin');
      expect(actor.id).not.toBe('usr-admin-root');
    });

    it('falls back safely to test runner headers when req.user is absent', () => {
      const mockReq = {
        headers: {
          'x-user-role': 'checker',
          'x-user-id': 'usr-test-runner',
          'x-user-name': 'Test Runner',
          'x-team-id': 'team-audit'
        }
      };

      const actor = getVerifiedActor(mockReq);

      expect(actor.id).toBe('usr-test-runner');
      expect(actor.role).toBe('checker');
      expect(actor.name).toBe('Test Runner');
      expect(actor.teamId).toBe('team-audit');
    });

    it('falls back to body/query parameters if no headers are present', () => {
      const mockReq = {
        body: {
          callerUserId: 'usr-caller-99',
          callerRole: 'operator',
          teamId: 'team-ops'
        }
      };

      const actor = getVerifiedActor(mockReq);

      expect(actor.id).toBe('usr-caller-99');
      expect(actor.role).toBe('operator');
      expect(actor.teamId).toBe('team-ops');
    });

    it('falls back to safe defaults when request is empty', () => {
      const actor = getVerifiedActor({});

      expect(actor.id).toBe('system');
      expect(actor.role).toBe('user');
      expect(actor.name).toBe('system');
      expect(actor.teamId).toBeUndefined();
    });
  });

  describe('Enterprise OAuth2 Admin Credential Segregation (Rule 14 & AUD-GOV-002)', () => {
    it('ensures operator roles cannot escalate privileges through body injection', () => {
      const operatorReq = {
        user: {
          id: 'usr-op-1',
          username: 'operator1',
          role: 'operator'
        },
        body: {
          callerRole: 'admin',
          adminPrivileges: { canApproveWorkflows: true }
        }
      };

      const actor = getVerifiedActor(operatorReq);
      const isAdmin = actor.role === 'admin' || actor.role === 'system_admin';
      expect(isAdmin).toBe(false);
    });
  });
});
