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
    expect(thread!.taskCreated).toBe(Boolean(intakeResult.createdIssueId));
    expect(thread!.linkedIssueId).toBe(intakeResult.createdIssueId || null);
    expect(thread!.hasAttachments).toBe(true);
    expect(thread!.attachments.length).toBeGreaterThan(0);
    expect(thread!.attachments[0].filename).toBe('daily_settlement_discrepancies.xlsx');
    expect(thread!.attachments[0].parsedData.rowCount).toBe(2);
    expect(thread!.participants.some((p: any) => p.address === 'settlements@partnerbank.com')).toBe(true);
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

    const outboundMsg = thread!.messages.find((m: any) => m.direction === 'outbound');
    expect(outboundMsg).toBeDefined();
    expect(outboundMsg.text_body).toContain('Investigation task has been staged');
    expect(outboundMsg.recipient_address).toBe('settlements@partnerbank.com');
  });

  it('4. collapses multi-message email conversation into a single thread via In-Reply-To, References, and Subject normalization', async () => {
    const parentMsgId = `<discrepancy-parent-${Date.now()}@aib-partner.com>`;
    const replyMsgId = `<discrepancy-reply-${Date.now()}@aib-partner.com>`;
    const followUpMsgId = `<discrepancy-fw-${Date.now()}@aib-partner.com>`;
    const commonSubject = `AIB Clearing Cycle #904 Discrepancy ${Date.now()}`;

    // Message A: Initial email without threadId or conversationId
    await messageIntakeService.processEnvelope({
      messageId: `msg-thread-a-${Date.now()}`,
      sourceChannel: 'email',
      sourceMessageId: parentMsgId,
      senderAddress: 'desk@aib-partner.com',
      senderName: 'AIB Partner Desk',
      senderType: 'person',
      teamId: testTeamId,
      receivedAt: new Date(Date.now() - 30000).toISOString(),
      textBody: `Please investigate discrepancy in clearing cycle #904.`,
      dedupeKey: `dedupe-a-${Date.now()}`,
      metadata: { subject: commonSubject }
    });

    // Message B: Customer follow-up with Re: and inReplyTo header
    await messageIntakeService.processEnvelope({
      messageId: `msg-thread-b-${Date.now()}`,
      sourceChannel: 'email',
      sourceMessageId: replyMsgId,
      senderAddress: 'desk@aib-partner.com',
      senderName: 'AIB Partner Desk',
      senderType: 'person',
      teamId: testTeamId,
      receivedAt: new Date(Date.now() - 20000).toISOString(),
      textBody: `Following up on the clearing cycle #904 discrepancy file.`,
      dedupeKey: `dedupe-b-${Date.now()}`,
      rawPayload: {
        inReplyTo: parentMsgId,
        subject: `Re: [EXTERNAL] ${commonSubject}`
      },
      metadata: { subject: `Re: [EXTERNAL] ${commonSubject}`, inReplyTo: parentMsgId }
    });

    // Verify both emails are grouped into ONE single thread
    const mailbox = await messageIntakeService.getTeamMailbox(testTeamId, 'all');
    const matchedThreads = mailbox.threads.filter(t => 
      t.subject.includes(commonSubject) || t.normalizedSubject.includes(commonSubject.toLowerCase())
    );
    expect(matchedThreads.length).toBe(1);
    const thread = matchedThreads[0];
    expect(thread.messages.length).toBe(2);

    // Message C: Team outbound reply dispatched to this thread
    await messageIntakeService.replyToMessage(testTeamId, {
      channel: 'email',
      to: 'desk@aib-partner.com',
      subject: `Re: ${commonSubject}`,
      textBody: 'We have received the file and our back-office team is investigating.',
      conversationId: thread.threadId,
      inReplyToMessageId: thread.messages[1].id
    });

    // Message D: Customer sends another reply referencing parent and reply message IDs
    await messageIntakeService.processEnvelope({
      messageId: `msg-thread-d-${Date.now()}`,
      sourceChannel: 'email',
      sourceMessageId: followUpMsgId,
      senderAddress: 'manager@aib-partner.com',
      senderName: 'AIB Partner Manager',
      senderType: 'person',
      teamId: testTeamId,
      receivedAt: new Date().toISOString(),
      textBody: `Thanks for the fast response. Please note the settlement cutoff is 4 PM.`,
      dedupeKey: `dedupe-d-${Date.now()}`,
      rawPayload: {
        references: `${parentMsgId} ${replyMsgId}`,
        subject: `Fwd: Re: ${commonSubject}`
      },
      metadata: { subject: `Fwd: Re: ${commonSubject}`, references: `${parentMsgId} ${replyMsgId}` }
    });

    // Re-query mailbox: All 4 messages (3 inbound, 1 outbound) MUST be united in 1 thread
    const finalMailbox = await messageIntakeService.getTeamMailbox(testTeamId, 'all');
    const finalThreads = finalMailbox.threads.filter(t => 
      t.subject.includes(commonSubject) || t.normalizedSubject.includes(commonSubject.toLowerCase())
    );
    expect(finalThreads.length).toBe(1);
    const unifiedThread = finalThreads[0];
    expect(unifiedThread.messages.length).toBe(4);
    expect(unifiedThread.participants.length).toBeGreaterThanOrEqual(2);
    expect(unifiedThread.participants.some((p: any) => p.address === 'desk@aib-partner.com')).toBe(true);
    expect(unifiedThread.participants.some((p: any) => p.address === 'manager@aib-partner.com')).toBe(true);
  });

  it('5. groups messages by Microsoft 365 Graph conversationId even when subject changes', async () => {
    const m365ConvId = `AAQkAD-${Date.now()}-M365-CONV`;

    await messageIntakeService.processEnvelope({
      messageId: `msg-m365-1-${Date.now()}`,
      sourceChannel: 'email',
      sourceMessageId: `m365-msg-1-${Date.now()}`,
      conversationId: m365ConvId,
      threadId: m365ConvId,
      senderAddress: 'trader@hedgefund.com',
      senderName: 'Prime Brokerage',
      senderType: 'person',
      teamId: testTeamId,
      receivedAt: new Date(Date.now() - 10000).toISOString(),
      textBody: 'Urgent trade settlement notice.',
      dedupeKey: `dedupe-m365-1-${Date.now()}`,
      metadata: { subject: 'Trade Confirmation #4401' }
    });

    await messageIntakeService.processEnvelope({
      messageId: `msg-m365-2-${Date.now()}`,
      sourceChannel: 'email',
      sourceMessageId: `m365-msg-2-${Date.now()}`,
      conversationId: m365ConvId,
      threadId: m365ConvId,
      senderAddress: 'trader@hedgefund.com',
      senderName: 'Prime Brokerage',
      senderType: 'person',
      teamId: testTeamId,
      receivedAt: new Date().toISOString(),
      textBody: 'Subject was changed by desk operator to: Trade Settlement Escalation',
      dedupeKey: `dedupe-m365-2-${Date.now()}`,
      metadata: { subject: 'Trade Settlement Escalation' }
    });

    const mailbox = await messageIntakeService.getTeamMailbox(testTeamId, 'all');
    const thread = mailbox.threads.find(t => t.threadId === m365ConvId);
    expect(thread).toBeDefined();
    expect(thread!.messages.length).toBe(2);
  });

  it('6. auto-inherits task linkage for subsequent email replies in the same thread', async () => {
    const parentMsgId = `<task-inherit-parent-${Date.now()}@bank.com>`;
    const replyMsgId = `<task-inherit-reply-${Date.now()}@bank.com>`;
    const testSubject = `Reconciliation Break Cycle #771 ${Date.now()}`;
    const testIssueId = `ISS-INHERIT-${Date.now()}`;

    const pool = getPostgresPool();
    await pool.query(
      `INSERT INTO issues (id, title, description, status, priority, creator_id, creator_name, team_id)
       VALUES ($1, 'Reconciliation Task 771', 'Desc', 'Open', 'High', 'usr-test-lead', 'Lead Tester', $2)
       ON CONFLICT (id) DO NOTHING;`,
      [testIssueId, testTeamId]
    );

    // Initial email
    const initialRes = await messageIntakeService.processEnvelope({
      messageId: `msg-inherit-parent-${Date.now()}`,
      sourceChannel: 'email',
      sourceMessageId: parentMsgId,
      senderAddress: 'ops@bank.com',
      senderName: 'Bank Ops',
      senderType: 'person',
      teamId: testTeamId,
      receivedAt: new Date(Date.now() - 10000).toISOString(),
      textBody: 'Discrepancy in file.',
      dedupeKey: `dedupe-inherit-1-${Date.now()}`,
      metadata: { subject: testSubject }
    });

    // Link parent to issue
    await messageIntakeService.linkMessageToIssue(initialRes.messageId, testIssueId);

    // Now follow-up email arrives with inReplyTo pointing to parent
    const replyRes = await messageIntakeService.processEnvelope({
      messageId: `msg-inherit-reply-${Date.now()}`,
      sourceChannel: 'email',
      sourceMessageId: replyMsgId,
      senderAddress: 'ops@bank.com',
      senderName: 'Bank Ops',
      senderType: 'person',
      teamId: testTeamId,
      receivedAt: new Date().toISOString(),
      textBody: 'Providing more details on the discrepancy.',
      dedupeKey: `dedupe-inherit-2-${Date.now()}`,
      rawPayload: { inReplyTo: parentMsgId, subject: `Re: ${testSubject}` },
      metadata: { subject: `Re: ${testSubject}`, inReplyTo: parentMsgId }
    });

    // The reply should automatically resolve and link to the same issue!
    expect(replyRes.linkedIssueId).toBe(testIssueId);

    // In mailbox, the thread should show taskCreated = true and linkedIssueId = testIssueId
    const mailbox = await messageIntakeService.getTeamMailbox(testTeamId, 'all');
    const thread = mailbox.threads.find(t => 
      t.subject.includes(testSubject) || t.normalizedSubject.includes(testSubject.toLowerCase())
    );
    expect(thread).toBeDefined();
    expect(thread!.taskCreated).toBe(true);
    expect(thread!.linkedIssueId).toBe(testIssueId);
    expect(thread!.messages.length).toBe(2);
  });

  it('7. EmailAdapter preserves In-Reply-To, References, and does not falsely default conversationId to sourceMessageId', async () => {
    const { EmailAdapter } = await import('../messaging/channelAdapters.js');
    const adapter = new EmailAdapter();

    // Case A: Initial message without parent
    const normInitial = adapter.normalize({
      from: 'settlements@partner.com',
      messageId: '<init-101@partner.com>',
      subject: 'Daily Settlement Discrepancy',
      text: 'File attached.'
    });
    expect(normInitial.sourceMessageId).toBe('<init-101@partner.com>');
    expect(normInitial.conversationId).toBeUndefined(); // Crucial: must NOT be set to '<init-101@partner.com>'

    // Case B: Reply with In-Reply-To and References
    const normReply = adapter.normalize({
      from: 'settlements@partner.com',
      messageId: '<reply-102@partner.com>',
      inReplyTo: '<init-101@partner.com>',
      references: '<init-101@partner.com>',
      subject: 'Re: Daily Settlement Discrepancy',
      text: 'Updated file.'
    });
    expect(normReply.sourceMessageId).toBe('<reply-102@partner.com>');
    expect(normReply.conversationId).toBe('<init-101@partner.com>');
    expect(normReply.metadata?.inReplyTo).toBe('<init-101@partner.com>');
    expect(normReply.metadata?.references).toBe('<init-101@partner.com>');
  });
});

