import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import http from 'node:http';
import express from 'express';
import { authRouter, sanitizeUser } from '../../routes/auth.js';
import { messagesRouter } from '../../routes/messages.js';
import { generateToken, getJwtSecret, verifyPassword, hashPassword } from '../../utils/auth.js';
import { repo } from '../../store/repository.js';
import { stagingService } from '../messaging/stagingService.js';
import { User } from '../../types.js';

describe('Authentication, JWT & OAuth 2.0 Credential Segregation Remediation (AUD-AUTH-001..003)', () => {
  let server: http.Server;
  let baseUrl: string;

  const mockAdminUser: User = {
    id: 'usr-admin-1',
    username: 'admin_test',
    email: 'admin@test.local',
    role: 'admin',
    isApproved: true,
    createdAt: new Date().toISOString(),
    password_hash: hashPassword('admin_pass_123')
  };

  const mockTechUser: User = {
    id: 'usr-tech-1',
    username: 'tech_test',
    email: 'tech@test.local',
    role: 'technical',
    isApproved: true,
    createdAt: new Date().toISOString(),
    password_hash: hashPassword('tech_pass_123')
  };

  const mockUnapprovedUser: User = {
    id: 'usr-unapproved-1',
    username: 'unapproved_user',
    email: 'unapproved@test.local',
    role: 'operational',
    isApproved: false,
    createdAt: new Date().toISOString(),
    password_hash: hashPassword('unapproved_123')
  };

  const adminToken = generateToken({
    id: mockAdminUser.id,
    username: mockAdminUser.username,
    email: mockAdminUser.email,
    role: mockAdminUser.role,
    isApproved: mockAdminUser.isApproved
  });

  const techToken = generateToken({
    id: mockTechUser.id,
    username: mockTechUser.username,
    email: mockTechUser.email,
    role: mockTechUser.role,
    isApproved: mockTechUser.isApproved
  });

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api/messages', messagesRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // ==========================================
  // AUD-AUTH-001: Authentication & Privilege Escalation
  // ==========================================
  describe('AUD-AUTH-001: Route Authentication, Admin Privilege & Registration Hardening', () => {
    it('rejects unauthenticated GET /api/auth/users with 401', async () => {
      const res = await fetch(`${baseUrl}/api/auth/users`);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toMatch(/Authentication required/i);
    });

    it('allows authenticated GET /api/auth/users and strips password_hash', async () => {
      vi.spyOn(repo, 'getUsers').mockResolvedValueOnce([mockAdminUser, mockTechUser]);

      const res = await fetch(`${baseUrl}/api/auth/users`, {
        headers: { Authorization: `Bearer ${techToken}` }
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(2);
      expect(data[0].password_hash).toBeUndefined();
      expect(data[1].password_hash).toBeUndefined();
      expect(data[0].username).toBe(mockAdminUser.username);
    });

    it('rejects PUT /api/auth/users/:id/approve without token (401)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/users/${mockUnapprovedUser.id}/approve`, {
        method: 'PUT'
      });
      expect(res.status).toBe(401);
    });

    it('rejects PUT /api/auth/users/:id/approve with non-admin token (403)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/users/${mockUnapprovedUser.id}/approve`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${techToken}` }
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Forbidden: Insufficient privileges/i);
    });

    it('allows PUT /api/auth/users/:id/approve when called by admin', async () => {
      vi.spyOn(repo, 'updateUser').mockResolvedValueOnce({
        ...mockUnapprovedUser,
        isApproved: true
      });

      const res = await fetch(`${baseUrl}/api/auth/users/${mockUnapprovedUser.id}/approve`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.message).toMatch(/approved successfully/i);
      expect(data.user.isApproved).toBe(true);
      expect(data.user.password_hash).toBeUndefined();
    });

    it('rejects PUT /api/auth/users/:id/role with non-admin token (403)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/users/${mockTechUser.id}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${techToken}`
        },
        body: JSON.stringify({ role: 'admin' })
      });
      expect(res.status).toBe(403);
    });

    it('rejects PUT /api/auth/users/:id/profile if caller is neither the user nor admin', async () => {
      const res = await fetch(`${baseUrl}/api/auth/users/${mockAdminUser.id}/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${techToken}`
        },
        body: JSON.stringify({ displayName: 'Hacked Name' })
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/only update your own user profile/i);
    });

    it('allows PUT /api/auth/users/:id/profile if caller updates their own profile', async () => {
      vi.spyOn(repo, 'updateUser').mockResolvedValueOnce({
        ...mockTechUser,
        displayName: 'Technical Guru'
      });

      const res = await fetch(`${baseUrl}/api/auth/users/${mockTechUser.id}/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${techToken}`
        },
        body: JSON.stringify({ displayName: 'Technical Guru' })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user.displayName).toBe('Technical Guru');
      expect(data.user.password_hash).toBeUndefined();
    });

    it('rejects POST /api/auth/register with role="admin" (privilege escalation prevention)', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'rogue_admin',
          email: 'rogue@admin.local',
          role: 'admin',
          password: 'secure_password_123'
        })
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/Administrative accounts cannot be created via public registration/i);
    });

    it('rejects POST /api/auth/register with unrecognized/invalid role', async () => {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'custom_role_user',
          email: 'custom@test.local',
          role: 'super_root',
          password: 'secure_password_123'
        })
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/Invalid registration role/i);
    });

    it('rejects POST /api/auth/login for unapproved account even if role was admin', async () => {
      vi.spyOn(repo, 'getUserByUsername').mockResolvedValueOnce({
        ...mockUnapprovedUser,
        role: 'admin' // Attempted admin role with isApproved = false
      });

      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: mockUnapprovedUser.username,
          password: 'unapproved_123'
        })
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toMatch(/Account registration is pending administrator approval/i);
    });
  });

  // ==========================================
  // AUD-AUTH-002: Cryptographic Rigor
  // ==========================================
  describe('AUD-AUTH-002: Cryptographic Secrets & Password Hash Rigor', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('enforces non-default, 32+ char JWT_SECRET in production mode', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;

      expect(() => getJwtSecret()).toThrow(/FATAL: JWT_SECRET environment variable must be set/i);

      process.env.JWT_SECRET = 'op_workflow_secret_key_prod_2026_x89f_secure_auth';
      expect(() => getJwtSecret()).toThrow(/FATAL: JWT_SECRET environment variable must be set/i);

      process.env.JWT_SECRET = 'a_very_secure_and_unique_production_secret_key_exceeding_32_chars';
      expect(getJwtSecret()).toBe('a_very_secure_and_unique_production_secret_key_exceeding_32_chars');
    });

    it('prohibits plaintext password fallback in production mode', () => {
      process.env.NODE_ENV = 'production';
      expect(verifyPassword('admin123', 'admin123')).toBe(false);
    });

    it('verifies salted PBKDF2 hash correctly and securely handles timing', () => {
      const hashed = hashPassword('my_secret_pass');
      expect(hashed).toContain(':');
      expect(verifyPassword('my_secret_pass', hashed)).toBe(true);
      expect(verifyPassword('wrong_pass', hashed)).toBe(false);
      // Malformed hash
      expect(verifyPassword('my_secret_pass', 'malformed_no_salt')).toBe(false);
    });
  });

  // ==========================================
  // AUD-AUTH-003: Credential Exposure & OAuth2 Authorization
  // ==========================================
  describe('AUD-AUTH-003: Credential Leak Prevention & Admin OAuth 2.0 Authorization', () => {
    it('sanitizeUser strips password_hash from user object', () => {
      const sanitized = sanitizeUser(mockAdminUser);
      expect((sanitized as any).password_hash).toBeUndefined();
      expect(sanitized.id).toBe(mockAdminUser.id);
      expect(sanitized.username).toBe(mockAdminUser.username);
    });

    it('POST /api/auth/login returns sanitized user without password_hash', async () => {
      vi.spyOn(repo, 'getUserByUsername').mockResolvedValueOnce(mockAdminUser);

      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: mockAdminUser.username,
          password: 'admin_pass_123'
        })
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.user).toBeDefined();
      expect(data.user.password_hash).toBeUndefined();
      expect(data.token).toBeDefined();
    });

    it('rejects unauthenticated GET /api/messages/admin/oauth2 with 401', async () => {
      const res = await fetch(`${baseUrl}/api/messages/admin/oauth2`);
      expect(res.status).toBe(401);
    });

    it('rejects non-admin GET /api/messages/admin/oauth2 with 403', async () => {
      const res = await fetch(`${baseUrl}/api/messages/admin/oauth2`, {
        headers: { Authorization: `Bearer ${techToken}` }
      });
      expect(res.status).toBe(403);
    });

    it('allows admin GET /api/messages/admin/oauth2 and returns masked secrets', async () => {
      vi.spyOn(stagingService, 'getAdminOAuth2Connections').mockResolvedValueOnce([
        {
          id: 'conn-1',
          teamId: null,
          channel: 'email',
          displayName: 'Corporate Exchange',
          status: 'ACTIVE',
          config: {
            clientId: 'client-123',
            clientSecret: 'super-sensitive-secret'
          }
        } as any
      ]);

      const res = await fetch(`${baseUrl}/api/messages/admin/oauth2`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data[0].config.clientSecret).toBe('••••••••');
      expect(data[0].config.hasSecret).toBe(true);
    });

    it('rejects unauthenticated GET /api/messages/admin/oauth2/available with 401', async () => {
      const res = await fetch(`${baseUrl}/api/messages/admin/oauth2/available`);
      expect(res.status).toBe(401);
    });

    it('allows authenticated users to access GET /api/messages/admin/oauth2/available without secrets', async () => {
      vi.spyOn(stagingService, 'getAdminOAuth2Connections').mockResolvedValueOnce([
        {
          id: 'conn-1',
          teamId: null,
          channel: 'email',
          displayName: 'Corporate Exchange',
          status: 'ACTIVE',
          config: {
            clientId: 'client-123',
            clientSecret: 'secret-xyz',
            tenantId: 'tenant-123'
          }
        } as any
      ]);

      const res = await fetch(`${baseUrl}/api/messages/admin/oauth2/available`, {
        headers: { Authorization: `Bearer ${techToken}` }
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data[0].id).toBe('conn-1');
      expect(data[0].config).toBeUndefined(); // Secrets and config object omitted
      expect(data[0].tenantId).toBe('tenant-123');
    });

    it('rejects POST /api/messages/admin/oauth2 from non-admin with 403', async () => {
      const res = await fetch(`${baseUrl}/api/messages/admin/oauth2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${techToken}`
        },
        body: JSON.stringify({
          displayName: 'Unauthorized Conn',
          channel: 'email',
          config: { clientId: 'id', clientSecret: 'sec' }
        })
      });

      expect(res.status).toBe(403);
    });

    it('rejects DELETE /api/messages/admin/oauth2/:id from non-admin with 403', async () => {
      const res = await fetch(`${baseUrl}/api/messages/admin/oauth2/conn-1`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${techToken}` }
      });

      expect(res.status).toBe(403);
    });
  });
});
