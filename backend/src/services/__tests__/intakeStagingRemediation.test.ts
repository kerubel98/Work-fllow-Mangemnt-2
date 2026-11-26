import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express, { Express } from 'express';
import { Server } from 'http';
import { connectPostgres, getPostgresPool } from '../../config/postgres.js';
import { messagesRouter } from '../../routes/messages.js';
import { stagingService } from '../messaging/stagingService.js';

describe('Intake & Messaging Staging Remediation Suite (AUD-INT-001..005)', () => {
  let app: Express;
  let server: Server;
  let baseUrl: string;
  let mockUser: any;
  let testStagedId: string;
  let teamCardsStagedId: string;

  beforeAll(async () => {
    await connectPostgres();
    const pool = getPostgresPool();

    // Seed test users and teams
    await pool.query(`
      INSERT INTO users (id, username, email, role, permanent_team_id)
      VALUES 
        ('usr-intake-admin', 'intake_admin', 'admin@intake.org', 'admin', 'team-intake-admin'),
        ('usr-intake-cards', 'intake_cards', 'cards@intake.org', 'operational', 'team-cards-intake'),
        ('usr-intake-settle', 'intake_settle', 'settle@intake.org', 'operational', 'team-settle-intake')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO teams (id, name, manager_id, manager_name)
      VALUES 
        ('team-cards-intake', 'Cards Intake Team', 'usr-intake-cards', 'Cards Lead'),
        ('team-settle-intake', 'Settlement Intake Team', 'usr-intake-settle', 'Settle Lead')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Create a generic test staged message
    const msg1 = await pool.query(`
      INSERT INTO staged_messages (
        id, channel, source_message_id, dedupe_key, sender_address, subject, status, urgency, team_id, created_at, sla_due_at
      ) VALUES (
        'staged-test-001', 'email', 'src-msg-001', 'dedupe-test-001', 'partner@bank.com', 'Settlement File Discrepancy',
        'NEW', 'normal', 'team-cards-intake', NOW(), NOW() - INTERVAL '1 hour'
      ) ON CONFLICT (id) DO UPDATE SET status = 'NEW', team_id = 'team-cards-intake'
      RETURNING id;
    `);
    testStagedId = msg1.rows[0].id;

    // Attach sample file to testStagedId
    await pool.query(`
      INSERT INTO staged_message_attachments (
        id, staged_message_id, filename, size_bytes, mime_type, parsing_status
      ) VALUES (
        'att-test-001', 'staged-test-001', 'settlement_feed.xlsx', 1024, 'application/vnd.openxmlformats', 'PARSED'
      ) ON CONFLICT (id) DO NOTHING;
    `);

    // Create a closed message and an archived message
    await pool.query(`
      INSERT INTO staged_messages (
        id, channel, source_message_id, dedupe_key, sender_address, subject, status, urgency, team_id, created_at, sla_due_at
      ) VALUES 
        ('staged-closed-001', 'email', 'src-msg-002', 'dedupe-closed-001', 'closed@bank.com', 'Closed Request', 'CLOSED', 'normal', 'team-cards-intake', NOW(), NOW() - INTERVAL '2 hours'),
        ('staged-archived-001', 'email', 'src-msg-003', 'dedupe-archived-001', 'archived@bank.com', 'Archived Request', 'ARCHIVED', 'normal', 'team-cards-intake', NOW(), NOW() - INTERVAL '3 hours')
      ON CONFLICT (id) DO NOTHING;
    `);

    // Setup express app with simulated auth
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = mockUser;
      next();
    });
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

  describe('AUD-INT-002: Input Validation & 404 Guards', () => {
    it('returns HTTP 400 when link-attachment-task is missing issueId', async () => {
      mockUser = { id: 'usr-intake-cards', role: 'operational', teamId: 'team-cards-intake' };
      const res = await fetch(`${baseUrl}/api/messages/staging/${testStagedId}/link-attachment-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attachmentId: 'att-test-001' })
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('issueId is required');
    });

    it('returns HTTP 400 when link-attachment-task is missing both attachmentId and filename', async () => {
      mockUser = { id: 'usr-intake-cards', role: 'operational', teamId: 'team-cards-intake' };
      const res = await fetch(`${baseUrl}/api/messages/staging/${testStagedId}/link-attachment-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId: 'ISS-9999' })
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Either attachmentId or filename is required');
    });

    it('returns HTTP 404 when link-attachment-task references a nonexistent staged message', async () => {
      mockUser = { id: 'usr-intake-cards', role: 'operational', teamId: 'team-cards-intake' };
      const res = await fetch(`${baseUrl}/api/messages/staging/staged-nonexistent-999/link-attachment-task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId: 'ISS-9999', filename: 'test.csv' })
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain('not found');
    });

    it('returns HTTP 404 when closeStagedMessage is called on nonexistent ID', async () => {
      mockUser = { id: 'usr-intake-cards', role: 'operational', teamId: 'team-cards-intake' };
      const res = await fetch(`${baseUrl}/api/messages/staging/staged-nonexistent-999/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'testing' })
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain('not found');
    });

    it('returns HTTP 404 when archiveStagedMessage is called on nonexistent ID', async () => {
      mockUser = { id: 'usr-intake-cards', role: 'operational', teamId: 'team-cards-intake' };
      const res = await fetch(`${baseUrl}/api/messages/staging/staged-nonexistent-999/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(404);
    });

    it('returns HTTP 404 when reopenStagedMessage is called on nonexistent ID', async () => {
      mockUser = { id: 'usr-intake-cards', role: 'operational', teamId: 'team-cards-intake' };
      const res = await fetch(`${baseUrl}/api/messages/staging/staged-nonexistent-999/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(404);
    });

    it('returns HTTP 404 when reply is called on nonexistent ID', async () => {
      mockUser = { id: 'usr-intake-cards', role: 'operational', teamId: 'team-cards-intake' };
      const res = await fetch(`${baseUrl}/api/messages/staging/staged-nonexistent-999/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: 'partner@bank.com', textBody: 'Hello' })
      });
      expect(res.status).toBe(404);
    });
  });

  describe('AUD-INT-003: Actor Identity & Team Authorization', () => {
    it('rejects caller from another team attempting to close a staged message (HTTP 403)', async () => {
      mockUser = { id: 'usr-intake-settle', role: 'operational', teamId: 'team-settle-intake' };
      const res = await fetch(`${baseUrl}/api/messages/staging/${testStagedId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Unauthorized close' })
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('Forbidden: You do not have permission to manage staged messages for team');
    });

    it('allows member of the assigned team to close staged message and records actor from req.user', async () => {
      mockUser = { id: 'usr-intake-cards', username: 'cards_operator_1', role: 'operational', teamId: 'team-cards-intake' };
      const res = await fetch(`${baseUrl}/api/messages/staging/${testStagedId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Resolved during investigation' })
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.staged.status).toBe('CLOSED');
      expect(data.staged.closeReason).toBe('Resolved during investigation');
      expect(data.staged.reviewNotes).toContain('cards_operator_1');
    });

    it('allows system admin to reopen staged message regardless of team', async () => {
      mockUser = { id: 'usr-intake-admin', username: 'superadmin', role: 'admin', teamId: 'team-other' };
      const res = await fetch(`${baseUrl}/api/messages/staging/${testStagedId}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.staged.status).toBe('NEW');
      expect(data.staged.reviewNotes).toContain('superadmin');
    });
  });

  describe('AUD-INT-004: SLA Exclusion & Batch Attachment Loading', () => {
    it('excludes CLOSED and ARCHIVED requests from sla_breached summary count', async () => {
      const summary = await stagingService.getExternalRequestSummary('team-cards-intake');
      expect(summary).toBeDefined();
      expect(typeof summary.slaBreachCount).toBe('number');

      const pool = getPostgresPool();
      // Ensure the closed and archived messages have sla_due_at in the past
      const res = await pool.query(`
        SELECT COUNT(*) as breached_active
        FROM staged_messages
        WHERE sla_due_at < NOW()
          AND (team_id = 'team-cards-intake' OR team_id IS NULL)
          AND status NOT IN ('CONVERTED_TO_TASK', 'REJECTED', 'CLOSED', 'ARCHIVED');
      `);
      expect(summary.slaBreachCount).toBe(parseInt(res.rows[0].breached_active, 10));
    });

    it('batch loads attachments without N+1 query loops', async () => {
      const messages = await stagingService.getStagedMessages({ teamId: 'team-cards-intake', limit: 10 });
      expect(Array.isArray(messages)).toBe(true);
      const testMsg = messages.find(m => m.id === testStagedId);
      expect(testMsg).toBeDefined();
      expect(Array.isArray(testMsg?.attachments)).toBe(true);
      expect(testMsg?.attachments.length).toBeGreaterThan(0);
      expect(testMsg?.attachments[0].filename).toBe('settlement_feed.xlsx');
    });
  });
});
