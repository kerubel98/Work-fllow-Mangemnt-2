/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { connectPostgres, getPostgresPool } from '../../config/postgres.js';
import { stagingService } from '../messaging/stagingService.js';
import { attachmentParserService } from '../messaging/attachmentParserService.js';
import { getProviderConnector } from '../messaging/providerConnectors.js';
import { emailAdapter } from '../messaging/channelAdapters.js';
import { repo } from '../../store/repository.js';
import { oauth2Service } from '../messaging/oauth2Service.js';
import * as XLSX from 'xlsx';
describe('External Request Staging, Attachment Parsing & Maker-Checker Suite', () => {
    beforeAll(async () => {
        await connectPostgres();
        const pool = getPostgresPool();
        // Ensure migration tables exist
        const fs = await import('fs');
        const path = await import('path');
        const migPath = path.resolve(process.cwd(), 'backend/src/database/migrations/020_external_request_staging.sql');
        if (fs.existsSync(migPath)) {
            const sql = fs.readFileSync(migPath, 'utf-8');
            await pool.query(sql);
        }
        await pool.query(`
      INSERT INTO users (id, username, email, role)
      VALUES ('usr_maker_ops_1', 'maker_ops_1', 'maker_ops_1@bank.com', 'operational'),
             ('usr_checker_ops_2', 'checker_ops_2', 'checker_ops_2@bank.com', 'supervisor')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO teams (id, name, manager_id, manager_name)
      VALUES ('team-cards-01', 'Card Disputes Team', 'usr_checker_ops_2', 'Dispute Supervisor')
      ON CONFLICT (id) DO NOTHING;
    `);
    });
    describe('1. Active Provider Connection & Connectors', () => {
        it('saves a provider connection and verifies credentials with testConnection', async () => {
            const provider = await stagingService.saveProviderConnection({
                channel: 'email',
                displayName: 'Partner Bank Corporate IMAP',
                teamId: 'team-settlement-01',
                config: {
                    host: 'imap.partnerbank.com',
                    user: 'settlement-ops@partnerbank.com',
                    port: 993,
                    secure: true
                },
                createdBy: 'usr_maker_ops_1'
            });
            expect(provider.id).toBeTruthy();
            expect(provider.channel).toBe('email');
            const testResult = await stagingService.testProviderConnection(provider.id);
            expect(testResult.success).toBe(true);
            expect(testResult.message).toContain('Successfully verified IMAP connection');
            const reloaded = await stagingService.getProviderConnections('team-settlement-01');
            expect(reloaded.some(p => p.id === provider.id)).toBe(true);
        });
        it('validates provider connector registry for all supported channels', () => {
            expect(getProviderConnector('email')).toBeDefined();
            expect(getProviderConnector('teams')).toBeDefined();
            expect(getProviderConnector('whatsapp')).toBeDefined();
            expect(getProviderConnector('telegram')).toBeDefined();
        });
    });
    describe('2. Multi-Format Attachment Parsing & Entity Recognition', () => {
        it('parses base64 Excel spreadsheets into tabular rows and detects headers', async () => {
            // Create a mock in-memory workbook
            const ws = XLSX.utils.json_to_sheet([
                { rrn_reference: 'RRN-9921', transaction_amount: 1450.50, response_code: '00', card_number: '411111******1111' },
                { rrn_reference: 'RRN-9922', transaction_amount: 3200.00, response_code: '05', card_number: '411111******2222' }
            ]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Discrepancies');
            const base64Buffer = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
            const parsed = await attachmentParserService.parseAttachments([
                {
                    id: 'att-test-01',
                    filename: 'clearing_mismatch.xlsx',
                    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    contentType: 'spreadsheet',
                    rawBase64: base64Buffer
                }
            ], 'Urgent: Customer claim for dispute #DISP-8829 on account ACC-440192 for $4,650.50 USD.', 'Settlement Exception Notification');
            expect(parsed.confidenceScore).toBeGreaterThan(0.7);
            expect(parsed.category).toBe('RECONCILIATION_EXCEPTION');
            expect(parsed.urgency).toBe('critical');
            expect(parsed.parsedFields.caseReference).toBe('#DISP-8829');
            expect(parsed.parsedFields.customerAccount).toBe('ACC-440192');
            expect(parsed.parsedFields.amount).toBe(4650.50);
            expect(parsed.parsedFields.currency).toBe('USD');
            expect(parsed.attachments.length).toBe(1);
            expect(parsed.attachments[0].parsingStatus).toBe('PARSED');
            expect(parsed.attachments[0].tabularHeaders).toContain('rrn_reference');
            expect(parsed.attachments[0].tabularRows?.length).toBe(2);
        });
    });
    describe('3. External Customer Request Staging & Advisory Locking', () => {
        it('stages inbound envelope and computes SLA deadline', async () => {
            const emailPayload = {
                from: 'customer_service@external-merchant.com',
                sourceMessageId: `ext-intake-${Date.now()}`,
                subject: 'Chargeback dispute for case DISP-10924',
                text: 'Please investigate chargeback of $850.00 on card account ACC-771822 immediately.',
                attachments: []
            };
            const envelope = emailAdapter.normalize(emailPayload);
            const staged = await stagingService.stageInboundEnvelope(envelope);
            expect(staged.id).toBeTruthy();
            expect(staged.status).toBe('READY_FOR_TASK_CREATION');
            expect(staged.parsedFields.caseReference).toBe('DISP-10924');
            expect(staged.slaDueAt).toBeTruthy();
            const list = await stagingService.getStagedMessages({ status: 'READY_FOR_TASK_CREATION' });
            expect(list.some(s => s.id === staged.id)).toBe(true);
        });
    });
    describe('4. Maker-Checker Dual Control & Anti-Self-Approval on Task Conversion', () => {
        it('allows Maker to propose task conversion', async () => {
            const emailPayload = {
                from: 'dispute_intake@visa.com',
                sourceMessageId: `visa-disp-${Date.now()}`,
                subject: 'Visa Dispute Notification REF-9901',
                text: 'Chargeback claim for $1,200.00 on customer ACC-998822.'
            };
            const envelope = emailAdapter.normalize(emailPayload);
            const staged = await stagingService.stageInboundEnvelope(envelope);
            const proposed = await stagingService.proposeTaskConversion(staged.id, { id: 'usr_maker_ops_1', name: 'Maker Ops 1' }, { title: 'Visa Chargeback Case REF-9901', priority: 'High', notes: 'Verified card authorization trace' });
            expect(proposed.status).toBe('READY_FOR_TASK_CREATION');
            expect(proposed.makerId).toBe('usr_maker_ops_1');
        });
        it('strictly forbids Maker from approving their own task conversion (Anti-Self-Approval Rule 7)', async () => {
            const emailPayload = {
                from: 'fraud_ops@partner.com',
                sourceMessageId: `fraud-${Date.now()}`,
                subject: 'Suspected Fraud Investigation',
                text: 'Account ACC-112233 dispute #ISS-550.'
            };
            const envelope = emailAdapter.normalize(emailPayload);
            const staged = await stagingService.stageInboundEnvelope(envelope);
            // Maker proposes
            await stagingService.proposeTaskConversion(staged.id, { id: 'usr_maker_ops_1', name: 'Maker Ops 1' }, { title: 'Fraud Case ACC-112233' });
            // Same maker attempts to approve
            await expect(stagingService.approveAndConvertTask(staged.id, { id: 'usr_maker_ops_1', name: 'Maker Ops 1' }, 'Attempted self-approval')).rejects.toThrow(/Anti-Self-Approval violation/);
        });
        it('successfully converts staged request into operational Issue when approved by independent Checker', async () => {
            const emailPayload = {
                from: 'clearing_house@centralbank.gov',
                sourceMessageId: `central-bank-${Date.now()}`,
                subject: 'Daily Clearing Discrepancy #ISS-772',
                text: 'Clearing mismatch of $50,000.00 reported by central switch.'
            };
            const envelope = emailAdapter.normalize(emailPayload);
            const staged = await stagingService.stageInboundEnvelope(envelope);
            // Maker proposes
            await stagingService.proposeTaskConversion(staged.id, { id: 'usr_maker_ops_1', name: 'Maker Ops 1' }, { title: 'Central Bank Clearing Discrepancy #ISS-772' });
            // Independent Checker approves
            const result = await stagingService.approveAndConvertTask(staged.id, { id: 'usr_checker_ops_2', name: 'Supervisor Checker 2' }, 'Supervisory verification passed. Task created.');
            expect(result.staged.status).toBe('CONVERTED_TO_TASK');
            expect(result.staged.createdIssueId).toBeTruthy();
            expect(result.issue.id).toBe(result.staged.createdIssueId);
            const issueInRepo = await repo.getIssueById(result.issue.id);
            expect(issueInRepo).toBeDefined();
            expect(issueInRepo?.chat?.length).toBeGreaterThan(0);
            expect(issueInRepo?.chat?.[0]?.senderName).toContain('Checker Approval');
        });
    });
    describe('5. External Request Intake Summary Metrics', () => {
        it('computes aggregated counts for leadership and personal follow-up', async () => {
            const summary = await stagingService.getExternalRequestSummary();
            expect(summary).toBeDefined();
            expect(summary.totalInbound).toBeGreaterThan(0);
            expect(summary.channelBreakdown).toBeDefined();
            expect(typeof summary.channelBreakdown.email).toBe('number');
        });
    });
    describe('6. OAuth 2.0 Modern Authentication & SASL XOAUTH2 Protocol', () => {
        it('resolves Microsoft 365, Google Workspace, and Custom token URLs correctly', () => {
            const msUrl = oauth2Service.resolveTokenUrl({
                providerPreset: 'MICROSOFT_365',
                tenantId: 'contoso-corp-tenant-uuid'
            });
            expect(msUrl).toBe('https://login.microsoftonline.com/contoso-corp-tenant-uuid/oauth2/v2.0/token');
            const googleUrl = oauth2Service.resolveTokenUrl({
                providerPreset: 'GOOGLE_WORKSPACE'
            });
            expect(googleUrl).toBe('https://oauth2.googleapis.com/token');
            const customUrl = oauth2Service.resolveTokenUrl({
                providerPreset: 'CUSTOM',
                tokenUrl: 'https://auth.partnerbank.com/v2/oauth/token'
            });
            expect(customUrl).toBe('https://auth.partnerbank.com/v2/oauth/token');
        });
        it('resolves correct default scopes per channel and provider', () => {
            const msTeamsScope = oauth2Service.resolveDefaultScope({ providerPreset: 'MICROSOFT_365' }, 'teams');
            expect(msTeamsScope).toBe('https://graph.microsoft.com/.default');
            const msEmailScope = oauth2Service.resolveDefaultScope({ providerPreset: 'MICROSOFT_365' }, 'email');
            expect(msEmailScope).toBe('https://outlook.office365.com/.default');
            const googleEmailScope = oauth2Service.resolveDefaultScope({ providerPreset: 'GOOGLE_WORKSPACE' }, 'email');
            expect(googleEmailScope).toBe('https://mail.google.com/');
        });
        it('generates valid SASL XOAUTH2 base64 tokens for modern IMAP/SMTP protocol', () => {
            const user = 'settlement-ops@partnerbank.com';
            const fakeToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0';
            const xoauth2Base64 = oauth2Service.buildXOAuth2Token(user, fakeToken);
            const decoded = Buffer.from(xoauth2Base64, 'base64').toString('utf-8');
            expect(decoded).toBe(`user=${user}\x01auth=Bearer ${fakeToken}\x01\x01`);
            expect(decoded.startsWith('user=')).toBe(true);
            expect(decoded.includes('\x01auth=Bearer ')).toBe(true);
            expect(decoded.endsWith('\x01\x01')).toBe(true);
        });
        it('handles testOAuth2Credentials gracefully when credentials are missing or invalid', async () => {
            const testRes = await oauth2Service.testOAuth2Credentials({
                providerPreset: 'MICROSOFT_365',
                clientId: '',
                clientSecret: ''
            }, 'email');
            expect(testRes.success).toBe(false);
            expect(testRes.message).toContain('OAuth2');
        });
    });
});
