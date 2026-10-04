/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { connectPostgres } from '../../config/postgres.js';
import { postgresRepo } from '../../store/postgresRepo.js';
import { hashtagService } from '../hashtagService.js';
import { approvalService } from '../approvalService.js';
describe('Universal Hashtag Engine Full Integration & Governance Suite (GAP-14)', () => {
    beforeAll(async () => {
        await connectPostgres();
    });
    describe('1. Type A File-Ingestion: Header Validation & Dictionary Lookup Resolution', () => {
        const typeATag = {
            tag: '#TEST_FILE_INGEST',
            description: 'Test Type A file ingestion with bank_code dictionary translation',
            criteria: 'status == "COMPLETED"',
            expectedFileStructure: ['transaction_id', 'bank_code', 'amount'],
            solutionTemplate: "UPDATE transactions SET status = 'RESOLVED' WHERE id = '{{transaction_id}}';",
            author: 'system_tester',
            createdAt: new Date().toISOString(),
            hashtagType: 'FILE_INGESTION',
            dataSourceMode: 'FILE_UPLOAD',
            minimumRequiredColumns: ['transaction_id', 'amount'],
            dictionaryLookupMappings: {
                bank_code: {
                    sourceCol: 'bank_code',
                    targetCol: 'bank_name',
                    lookupTable: 'global_banks',
                    fallbackValue: 'UNKNOWN_BANK'
                }
            }
        };
        it('creates and persists Type A hashtag preset in postgres repository', async () => {
            const created = await postgresRepo.createHashtag(typeATag);
            expect(created).toBeDefined();
            expect(created.tag).toBe('#TEST_FILE_INGEST');
            expect(created.hashtagType).toBe('FILE_INGESTION');
            const retrieved = await postgresRepo.getHashtagByTag('test_file_ingest');
            expect(retrieved).toBeDefined();
            expect(retrieved?.tag).toBe('#TEST_FILE_INGEST');
        });
        it('rejects raw rows missing mandatory minimum required columns', async () => {
            const invalidRows = [
                { bank_code: '001', amount: 100 } // Missing transaction_id!
            ];
            const result = await hashtagService.executeFileIngestionHashtag(typeATag, invalidRows);
            expect(result.valid).toBe(false);
            expect(result.missingColumns).toContain('transaction_id');
            expect(result.enrichedRecords.length).toBe(0);
        });
        it('validates rows, resolves bank_code to bank_name via dictionary, and transforms dataset', async () => {
            const validRows = [
                { transaction_id: 'TXN-901', bank_code: '001', amount: '250.75' },
                { transaction_id: 'TXN-902', bank_code: '002', amount: 1500 }
            ];
            const result = await hashtagService.executeFileIngestionHashtag(typeATag, validRows);
            expect(result.valid).toBe(true);
            expect(result.missingColumns.length).toBe(0);
            expect(result.enrichedRecords.length).toBe(2);
            // Verify dictionary enrichment
            expect(result.enrichedRecords[0]).toHaveProperty('bank_name');
            expect(result.enrichedRecords[0].bank_name).toBe('Commercial Bank of Ethiopia');
            expect(result.enrichedRecords[1].bank_name).toBe('Awash International Bank');
        });
    });
    describe('2. Type B Database-Direct Scanner: Zero-File Scan & Anomaly Detection', () => {
        const typeBTag = {
            tag: '#TEST_DB_SCANNER',
            description: 'Test Type B zero-file direct database scanner for stuck transactions',
            criteria: 'status = \'PENDING\'',
            expectedFileStructure: [],
            solutionTemplate: "UPDATE transactions SET status = 'RECHECKED' WHERE id = '{{id}}';",
            author: 'system_tester',
            createdAt: new Date().toISOString(),
            hashtagType: 'DATABASE_DIRECT_SCANNER',
            dataSourceMode: 'DATABASE_DIRECT',
            targetDbId: null, // Scans internal operational DB
            targetTableName: 'transactions'
        };
        it('registers Type B scanner hashtag in repository', async () => {
            const created = await postgresRepo.createHashtag(typeBTag);
            expect(created.hashtagType).toBe('DATABASE_DIRECT_SCANNER');
            expect(created.dataSourceMode).toBe('DATABASE_DIRECT');
        });
        it('executes direct database scan in dry-run mode without modifying production tables', async () => {
            const scanResult = await hashtagService.executeDatabaseDirectScan(typeBTag, 'tester_user_01', true // isDryRun
            );
            expect(scanResult).toBeDefined();
            expect(scanResult.verdict).toBeDefined();
            expect(Array.isArray(scanResult.anomalyRows)).toBe(true);
            expect(scanResult.executionDurationMs).toBeGreaterThanOrEqual(0);
        });
    });
    describe('3. Type C Extraction Staging: Dynamic Table Provisioning with 64-Bit Lock & Batched Insert', () => {
        const typeCTag = {
            tag: '#TEST_STAGING_ETL',
            description: 'Test Type C extraction and staging into dedicated application table',
            criteria: 'amount > 1000',
            expectedFileStructure: [],
            solutionTemplate: "SELECT 1;",
            author: 'system_tester',
            createdAt: new Date().toISOString(),
            hashtagType: 'EXTRACTION_STAGING',
            dataSourceMode: 'DATABASE_DIRECT',
            targetDbId: null,
            targetTableName: 'transactions',
            dedicatedAppTable: 'app_stage_test_extract'
        };
        it('registers Type C staging preset and executes batch extraction and set-based chunk insert into staged table', async () => {
            await postgresRepo.createHashtag(typeCTag);
            const extractionResult = await hashtagService.executeExtractionStaging(typeCTag, 'tester_user_01');
            expect(extractionResult).toBeDefined();
            expect(extractionResult.stagedTableName).toBe('app_stage_test_extract');
            expect(extractionResult.rowsInserted).toBeGreaterThanOrEqual(0);
            expect(extractionResult.errors.length).toBe(0);
        });
    });
    describe('4. Type D Auditing & Governance: Observational Sweep with Diagnostic Taint Tracking', () => {
        const typeDTag = {
            tag: '#TEST_AUDIT_GOVERNANCE',
            description: 'Test Type D compliance and governance audit with diagnostic-only flags',
            criteria: 'status = \'REVERTED\'',
            expectedFileStructure: [],
            solutionTemplate: "SELECT 1;",
            author: 'auditor_usr',
            createdAt: new Date().toISOString(),
            hashtagType: 'AUDITING_GOVERNANCE',
            dataSourceMode: 'DATABASE_DIRECT',
            targetDbId: null,
            targetTableName: 'transactions'
        };
        it('registers Type D audit preset', async () => {
            const created = await postgresRepo.createHashtag(typeDTag);
            expect(created.hashtagType).toBe('AUDITING_GOVERNANCE');
        });
        it('executes audit sweep and enforces isDiagnosticOnly: true on the verdict and all rows', async () => {
            const auditResult = await hashtagService.executeAuditingGovernance(typeDTag, 'team_audit');
            expect(auditResult).toBeDefined();
            expect(auditResult.isDiagnosticOnly).toBe(true);
            expect(Array.isArray(auditResult.auditRows)).toBe(true);
            for (const rec of auditResult.auditRows) {
                expect(rec._isDiagnosticOnly).toBe(true);
                expect(rec._diagnosticTaintReason).toContain('TYPE_D_AUDITING_SWEEP');
            }
        });
    });
    describe('5. Maker-Checker Dual Authorization & Anti-Self-Approval (Rule 7)', () => {
        it('submits Maker proposal for transaction resolution and locks in PENDING', async () => {
            const proposal = await approvalService.submitProposal({
                type: 'WORKSPACE_SETTING',
                settingKey: '#TEST_FILE_INGEST',
                title: 'Reconciliation Force Match Policy for Stuck Txn',
                justification: 'Discrepancy reconciled against settlement logs',
                makerId: 'maker_operator_01',
                makerName: 'Maker Operator',
                teamId: 'team-cards',
                proposedChanges: { action: 'FORCE_MATCH', sql: "UPDATE transactions SET status = 'RESOLVED';" },
                evidenceSnapshot: { matchedRows: 2, hashtag: '#TEST_FILE_INGEST' }
            });
            expect(proposal).toBeDefined();
            expect(proposal.id).toBeTruthy();
            expect(proposal.status).toBe('PENDING');
            expect(proposal.makerId).toBe('maker_operator_01');
            // Attempt self-approval: checkerId === makerId MUST throw Anti-Self-Approval error
            await expect(approvalService.reviewProposal({
                id: proposal.id,
                checkerId: 'maker_operator_01', // Same as maker!
                checkerName: 'Maker Operator',
                action: 'APPROVE'
            })).rejects.toThrow(/Anti-Self-Approval Violation/);
            // Independent Checker approval succeeds
            const approved = await approvalService.reviewProposal({
                id: proposal.id,
                checkerId: 'checker_supervisor_02', // Independent Checker
                checkerName: 'Checker Supervisor',
                action: 'APPROVE'
            });
            expect(approved.status).toBe('APPROVED');
            expect(approved.checkerId).toBe('checker_supervisor_02');
        });
    });
});
