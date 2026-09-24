/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { connectPostgres } from '../../config/postgres.js';
import { 
  emailAdapter, 
  teamsAdapter, 
  whatsAppAdapter, 
  telegramAdapter 
} from '../messaging/channelAdapters.js';
import { messageIntakeService } from '../messaging/messageIntakeService.js';
import { outboundDispatchService } from '../messaging/outboundDispatchService.js';
import { approvalService } from '../approvalService.js';
import { repo } from '../../store/repository.js';
import { Issue } from '../../types.js';

describe('Messaging Integration Architecture Verification Suite', () => {
  beforeAll(async () => {
    await connectPostgres();
    const { getPostgresPool } = await import('../../config/postgres.js');
    const pool = getPostgresPool();
    await pool.query(`
      INSERT INTO users (id, username, email, role)
      VALUES ('usr_maker_ext', 'maker_ext', 'maker_ext@bank.com', 'operational'),
             ('usr_checker_ext', 'checker_ext', 'supervisor_ext@bank.com', 'supervisor')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO teams (id, name, manager_id, manager_name)
      VALUES ('team-settlement-01', 'Settlement Operations Team', 'usr_checker_ext', 'External Supervisor')
      ON CONFLICT (id) DO NOTHING;
    `);


  });


  describe('1. Canonical Channel Adapters & Envelope Normalization', () => {
    it('normalizes an incoming Email into a canonical MessageEnvelope with attachments', () => {
      const emailPayload = {
        from: 'analyst@bank.com',
        fromName: 'Sarah Analyst',
        subject: 'Reconciliation discrepancies for #ISS-105',
        text: 'Please review the attached spreadsheet for mismatched transactions.',
        messageId: 'email-msg-test-01',
        attachments: [
          {
            filename: 'mismatched_txns.csv',
            mimeType: 'text/csv',
            size: 4096
          }
        ]
      };

      const envelope = emailAdapter.normalize(emailPayload);

      expect(envelope).toBeDefined();
      expect(envelope.sourceChannel).toBe('email');
      expect(envelope.senderAddress).toBe('analyst@bank.com');
      expect(envelope.senderName).toBe('Sarah Analyst');
      expect(envelope.textBody).toContain('Reconciliation discrepancies for #ISS-105');
      expect(envelope.attachments?.length).toBe(1);
      expect(envelope.attachments?.[0].contentType).toBe('spreadsheet');
      expect(envelope.dedupeKey).toContain('email:email-msg-test-01');
    });

    it('normalizes a Microsoft Teams Bot Framework activity payload', () => {
      const teamsPayload = {
        id: 'teams-act-101',
        from: { id: 'usr-teams-lead', name: 'Teams Lead', userPrincipalName: 'lead@bank.com' },
        conversation: { id: 'conv-channel-99', conversationType: 'channel', isGroup: true },
        text: 'What is the status of #ISS-105?'
      };

      const envelope = teamsAdapter.normalize(teamsPayload);

      expect(envelope.sourceChannel).toBe('teams');
      expect(envelope.senderAddress).toBe('usr-teams-lead');
      expect(envelope.senderType).toBe('team');
      expect(envelope.dedupeKey).toContain('teams:teams-act-101');
    });

    it('normalizes a Meta WhatsApp Cloud API webhook message', () => {
      const waPayload = {
        entry: [{
          changes: [{
            value: {
              contacts: [{ profile: { name: 'Support Operator' } }],
              messages: [{
                from: '1234567890',
                id: 'wamid-test-999',
                type: 'text',
                text: { body: '@escalate_issue team-cards urgent customer reversal' },
                timestamp: '1727136000'
              }]
            }
          }]
        }]
      };

      const envelope = whatsAppAdapter.normalize(waPayload);

      expect(envelope.sourceChannel).toBe('whatsapp');
      expect(envelope.senderAddress).toBe('1234567890');
      expect(envelope.senderName).toBe('Support Operator');
      expect(envelope.textBody).toBe('@escalate_issue team-cards urgent customer reversal');
    });

    it('normalizes a Telegram Bot API update payload', () => {
      const tgPayload = {
        message: {
          message_id: 8877,
          from: { id: 987654, first_name: 'John', last_name: 'Doe', username: 'johndoe' },
          chat: { id: -100123456789, type: 'group' },
          text: 'New incident reported #ISS-999',
          date: 1727136000
        }
      };

      const envelope = telegramAdapter.normalize(tgPayload);

      expect(envelope.sourceChannel).toBe('telegram');
      expect(envelope.senderAddress).toBe('987654');
      expect(envelope.senderName).toBe('John Doe');
      expect(envelope.senderType).toBe('team');
      expect(envelope.dedupeKey).toContain('telegram:8877');
    });
  });

  describe('2. 64-Bit Cryptographic Advisory Lock Deduplication', () => {
    it('suppresses duplicate message processing when same dedupe key is submitted', async () => {
      const uniqueSourceId = `wa-dedupe-${Date.now()}`;
      const payload = {
        from: '+251911223344',
        senderAddress: '+251911223344',
        sourceMessageId: uniqueSourceId,
        text: 'Duplicate delivery test message',
        body: 'Duplicate delivery test message'
      };

      const envelope1 = whatsAppAdapter.normalize(payload);
      const res1 = await messageIntakeService.processEnvelope(envelope1);

      expect(res1.status).toBe('PROCESSED');

      // Immediate second delivery with identical sourceMessageId and content
      const envelope2 = whatsAppAdapter.normalize(payload);
      const res2 = await messageIntakeService.processEnvelope(envelope2);

      expect(res2.status).toBe('DUPLICATE_IGNORED');
      expect(res2.messageId).toBe(res1.messageId);
    });
  });

  describe('3. Anti-Self-Approval Enforcement on External Channels', () => {
    it('strictly rejects external channel approval command when sender is the proposal Maker', async () => {
      // 1. Register personal channel config for Maker
      await messageIntakeService.savePersonalConfiguration({
        userId: 'usr_maker_ext',
        channel: 'email',
        address: 'maker_ext@bank.com',
        displayName: 'External Maker'
      });

      // 2. Submit a Maker Proposal
      const proposal = await approvalService.submitProposal({
        type: 'WORKSPACE_SETTING',
        settingKey: 'auto_reversal_limit',
        title: 'Increase limit to $10,000',
        justification: 'External approval test',
        makerId: 'usr_maker_ext',
        makerName: 'External Maker',
        teamId: 'team-settlement-01',
        proposedChanges: { limit: 10000 }
      });

      // 3. Sender sends an email attempting to self-approve
      const emailPayload = {
        from: 'maker_ext@bank.com',
        sourceMessageId: `email-self-appr-${Date.now()}`,
        text: `@approve proposal ${proposal.id} confirmed`,
        subject: `Approval for ${proposal.id}`
      };

      const envelope = emailAdapter.normalize(emailPayload);
      const result = await messageIntakeService.processEnvelope(envelope);

      expect(result.status).toBe('PROCESSED');
      expect(result.intent).toBe('APPROVAL_REQUEST');
      expect(result.replyText).toContain('Approval action rejected');
      expect(result.replyText).toContain('Anti-Self-Approval Violation');

      // Verify proposal is still pending
      const checkProposal = await approvalService.getApprovalById(proposal.id);
      expect(checkProposal?.status).toBe('PENDING');
    });

    it('successfully approves proposal when sent by an independent Supervisor channel identity', async () => {
      // 1. Register personal channel config for Supervisor (Checker)
      await messageIntakeService.savePersonalConfiguration({
        userId: 'usr_checker_ext',
        channel: 'email',
        address: 'supervisor_ext@bank.com',
        displayName: 'External Supervisor'
      });

      // 2. Submit a Maker Proposal by different user
      const proposal = await approvalService.submitProposal({
        type: 'WORKSPACE_SETTING',
        settingKey: 'tolerance_percentage',
        title: 'Set tolerance to 1%',
        justification: 'Independent review test',
        makerId: 'usr_maker_ext',
        makerName: 'External Maker',
        teamId: 'team-settlement-01',
        proposedChanges: { tolerance: 0.01 }
      });

      // 3. Supervisor approves via external channel
      const emailPayload = {
        from: 'supervisor_ext@bank.com',
        sourceMessageId: `email-checker-appr-${Date.now()}`,
        text: `@approve proposal ${proposal.id} accepted by audit team`,
        subject: `Approved ${proposal.id}`
      };

      const envelope = emailAdapter.normalize(emailPayload);
      const result = await messageIntakeService.processEnvelope(envelope);

      expect(result.status).toBe('PROCESSED');
      expect(result.intent).toBe('APPROVAL_REQUEST');
      expect(result.replyText).toContain('has been successfully APPROVED');

      // Verify proposal status in DB
      const checkProposal = await approvalService.getApprovalById(proposal.id);
      expect(checkProposal?.status).toBe('APPROVED');

    });
  });

  describe('4. Inbound Escalation & Team Sync', () => {
    it('creates an escalation event and appends to issue chat when @escalate_issue command is received', async () => {
      // 1. Create a dummy issue
      const dummyIssue: Issue = {
        id: `ISS-${Date.now().toString().slice(-6)}`,
        title: 'Settlement Glitch',
        description: 'Testing external escalation sync',
        status: 'Open',
        priority: 'High',
        creatorId: 'usr-tester',
        creatorName: 'Tester',
        createdAt: new Date().toISOString(),
        type: 'single',
        teamId: 'team-settlement-01',
        visibility: 'TEAM_PUBLIC',
        chat: []
      };
      const createdIssue = await repo.createIssue(dummyIssue);

      // 2. Send Teams message with escalation command referencing issue ID
      const teamsPayload = {
        id: `teams-esc-${Date.now()}`,
        from: { id: 'ext-lead@bank.com', name: 'Ops Director' },
        conversation: { id: 'conv-ops-101', conversationType: 'channel', isGroup: true },
        text: `@escalate_issue team-cards High priority dispute for #${createdIssue.id}`
      };

      const envelope = teamsAdapter.normalize(teamsPayload);
      const result = await messageIntakeService.processEnvelope(envelope);

      expect(result.status).toBe('PROCESSED');
      expect(result.intent).toBe('TEAM_ESCALATION');
      expect(result.commandExecuted).toBe(true);
      expect(result.linkedIssueId).toBe(createdIssue.id);

      // Verify message was appended to issue chat
      const reloadedIssue = await repo.getIssueById(createdIssue.id);
      expect(reloadedIssue?.chat?.length).toBeGreaterThan(0);
      const lastMsg = reloadedIssue?.chat?.[reloadedIssue.chat.length - 1];
      expect(lastMsg?.text).toContain('@escalate_issue');
      expect(lastMsg?.senderName).toContain('TEAMS');
    });
  });

  describe('5. Task Creation & Dataset Attachment Pipeline', () => {
    it('creates an Issue in PENDING_MAPPING state when message contains spreadsheet attachment', async () => {
      const emailWithSheet = {
        from: 'client_operations@partner.com',
        sourceMessageId: `email-sheet-${Date.now()}`,
        subject: 'Monthly Batch Settlement Reconcile',
        text: 'Please reconcile the attached daily ledger.',
        attachments: [
          {
            filename: 'daily_ledger.xlsx',
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            size: 15420
          }
        ]
      };

      const envelope = emailAdapter.normalize(emailWithSheet);
      const result = await messageIntakeService.processEnvelope(envelope);

      expect(result.status).toBe('PROCESSED');
      expect(result.intent).toBe('ATTACHMENT_TASK');
      expect(result.createdIssueId).toBeTruthy();

      const created = await repo.getIssueById(result.createdIssueId!);
      expect(created?.type).toBe('file');
      expect(created?.uploadedFileName).toBe('daily_ledger.xlsx');
      expect(created?.datasetStatus).toBe('PENDING_MAPPING');
    });
  });

  describe('6. PostgreSQL Transactional Outbox Delivery', () => {
    it('queues response in outgoing_messages and updates status to SENT on dispatch', async () => {
      const outboxId = await outboundDispatchService.enqueueMessage({
        to: '+251911998877',
        channel: 'whatsapp',
        body: 'Your task #ISS-105 is currently being reconciled.'
      });

      expect(outboxId).toBeTruthy();

      // Retrieve from outbox
      const messages = await outboundDispatchService.getOutboxMessages(10);
      const item = messages.find(m => m.id === outboxId);

      expect(item).toBeDefined();
      expect(item.recipient_address).toBe('+251911998877');
      expect(item.status).toBe('SENT');
      expect(item.sent_at).toBeTruthy();
    });
  });
});
