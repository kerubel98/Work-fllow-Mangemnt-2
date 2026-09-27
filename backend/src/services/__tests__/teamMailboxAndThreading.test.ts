/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { connectPostgres, getPostgresPool } from '../../config/postgres.js';
import { messageIntakeService } from '../messaging/messageIntakeService.js';
import { MessageEnvelope } from '../../models/messageTypes.js';

describe('Team Mailbox, Thread Awareness & Task Linking Test Suite', () => {
  const testTeamId = `team-mailbox-test-${Date.now()}`;
  const testConversationId = `conv-${Date.now()}`;

  beforeAll(async () => {
    await connectPostgres();
    const pool = getPostgresPool();
    // Ensure test team exists in database
    await pool.query(
      `INSERT INTO teams (id, name, description, team_type, manager_id, manager_name)
       VALUES ($1, 'Mailbox Test Ops Team', 'Automated test team', 'working', 'usr-test-lead', 'Lead Tester')
       ON CONFLICT (id) DO NOTHING;`,
      [testTeamId]
    );
  });

  it('1. ingests incoming email with spreadsheet attachment and collates into team mailbox', async () => {
    const envelope: MessageEnvelope = {
      messageId: `msg-${Date.now()}-1`,
      sourceChannel: 'email',
      sourceMessageId: `<ref-email-${Date.now()}@bankpartner.com>`,
      conversationId: testConversationId,
      threadId: testConversationId,
      senderAddress: 'settlements@partnerbank.com',
      senderName: 'Bank Settlement Desk',
      senderType: 'person',
      teamId: testTeamId,
      receivedAt: new Date().toISOString(),
      textBody: 'Please review the attached reconciliation discrepancies for settlement cycle #8829.',
      dedupeKey: `dedupe-${Date.now()}-1`,
      attachments: [
        {
          id: `att-${Date.now()}-1`,
          filename: 'daily_settlement_discrepancies.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          sizeBytes: 15420,
          contentType: 'spreadsheet',
          parsedData: {
            sampleHeaders: ['Transaction_ID', 'Amount', 'Currency', 'Status'],
            sampleRows: [
              { Transaction_ID: 'TXN-9091', Amount: 450.00, Currency: 'USD', Status: 'FAILED' },
              { Transaction_ID: 'TXN-9092', Amount: 1200.50, Currency: 'USD', Status: 'UNMATCHED' }
            ],
            rowCount: 2
          },
          rawBase64: 'UEsDBBQAAAAIA...'
        }
      ]
    };

    const intakeResult = await messageIntakeService.processEnvelope(envelope);
    expect(intakeResult.messageId).toBeDefined();

    // Fetch team mailbox
    const mailbox = await messageIntakeService.getTeamMailbox(testTeamId, 'all');
    expect(mailbox.threads.length).toBeGreaterThan(0);

    const thread = mailbox.threads.find(t => t.threadId === testConversationId);
    expect(thread).toBeDefined();
    expect(thread!.channel).toBe('email');
    expect(thread!.taskCreated).toBe(false);
    expect(thread!.linkedIssueId).toBeNull();
    expect(thread!.hasAttachments).toBe(true);
    expect(thread!.attachments.length).toBeGreaterThan(0);
    expect(thread!.attachments[0].filename).toBe('daily_settlement_discrepancies.xlsx');
    expect(thread!.attachments[0].parsedData.rowCount).toBe(2);
    expect(thread!.participants.some(p => p.address === 'settlements@partnerbank.com')).toBe(true);
  });

  it('2. links message to created task and updates anti-duplication status across thread', async () => {
    const mailbox = await messageIntakeService.getTeamMailbox(testTeamId, 'all');
    const thread = mailbox.threads.find(t => t.threadId === testConversationId);
    expect(thread).toBeDefined();

    const incomingMsgId = thread!.messages[0].id;
    const testIssueId = `ISS-TEST-${Date.now()}`;
    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO issues (id, title, description, status, priority, creator_id, creator_name, team_id)
       VALUES ($1, 'Discrepancy Investigation Task', 'Investigating discrepancies', 'Open', 'High', 'usr-test-lead', 'Lead Tester', $2)
       ON CONFLICT (id) DO NOTHING;`,
      [testIssueId, testTeamId]
    );

    // Link message to task
    const linkSuccess = await messageIntakeService.linkMessageToIssue(incomingMsgId, testIssueId);
    expect(linkSuccess).toBe(true);

    // Re-fetch mailbox and verify thread status
    const updatedMailbox = await messageIntakeService.getTeamMailbox(testTeamId, 'all');
    const updatedThread = updatedMailbox.threads.find(t => t.threadId === testConversationId);
    expect(updatedThread).toBeDefined();
    expect(updatedThread!.taskCreated).toBe(true);
    expect(updatedThread!.linkedIssueId).toBe(testIssueId);

    // Verify filter 'unassigned' excludes this thread
    const unassignedMailbox = await messageIntakeService.getTeamMailbox(testTeamId, 'unassigned');
    expect(unassignedMailbox.threads.some(t => t.threadId === testConversationId)).toBe(false);
  });

  it('3. sends outbound reply and appends to thread history', async () => {
    const replyResult = await messageIntakeService.replyToMessage(testTeamId, {
      channel: 'email',
      to: 'settlements@partnerbank.com',
      subject: 'Re: Settlement Cycle #8829 Discrepancies',
      textBody: 'Investigation task has been staged. Our operations engineers are validating the clearing file.',
      conversationId: testConversationId,
      threadId: testConversationId
    });

    expect(replyResult.id).toBeDefined();
    expect(replyResult.status).toBe('QUEUED');

    // Re-fetch mailbox and verify outbound message is included in thread
    const mailbox = await messageIntakeService.getTeamMailbox(testTeamId, 'all');
    const thread = mailbox.threads.find(t => t.threadId === testConversationId);
    expect(thread).toBeDefined();
    expect(thread!.messages.length).toBeGreaterThanOrEqual(2);

    const outboundMsg = thread!.messages.find(m => m.direction === 'outbound');
    expect(outboundMsg).toBeDefined();
    expect(outboundMsg.text_body).toContain('Investigation task has been staged');
    expect(outboundMsg.recipient_address).toBe('settlements@partnerbank.com');
  });
});
