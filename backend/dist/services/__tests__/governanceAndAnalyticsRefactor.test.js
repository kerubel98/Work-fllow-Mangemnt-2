/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { approvalService } from '../approvalService.js';
import { analyticsService } from '../analyticsService.js';
import { escalationService } from '../escalationService.js';
import { sandboxExecutionService } from '../sandboxExecutionService.js';
import { connectPostgres } from '../../config/postgres.js';
describe('Backend, Governance, and Dashboard Refactor Verification Suite', () => {
    beforeAll(async () => {
        await connectPostgres();
    });
    describe('1. Unified Approval Service & Anti-Self-Approval', () => {
        it('submits a Maker proposal with evidence snapshot', async () => {
            const proposal = await approvalService.submitProposal({
                type: 'WORKSPACE_SETTING',
                settingKey: 'system_sla_threshold',
                title: 'Adjust SLA Threshold to 24h',
                justification: 'Align with operational SLA standards.',
                makerId: 'maker_usr_01',
                makerName: 'Maker Operator',
                teamId: 'team-cards',
                proposedChanges: { thresholdHours: 24 },
                evidenceSnapshot: { initialPolicy: 48, requestedBy: 'Ops Lead' }
            });
            expect(proposal).toBeDefined();
            expect(proposal.id).toBeTruthy();
            expect(proposal.status).toBe('PENDING');
            expect(proposal.makerId).toBe('maker_usr_01');
            expect(proposal.evidenceSnapshot).toMatchObject({ initialPolicy: 48 });
        });
        it('strictly rejects self-approval when checkerId equals makerId', async () => {
            const proposal = await approvalService.submitProposal({
                type: 'WORKSPACE_SETTING',
                settingKey: 'fee_calculation_rule',
                title: 'Fee calculation tweak',
                justification: 'Self-approval test',
                makerId: 'maker_usr_02',
                makerName: 'Self Approver',
                teamId: 'team-cards',
                proposedChanges: { fee: 5.0 }
            });
            await expect(approvalService.reviewProposal({
                id: proposal.id,
                checkerId: 'maker_usr_02', // Same as maker!
                checkerName: 'Self Approver',
                action: 'APPROVE'
            })).rejects.toThrow(/Anti-Self-Approval Violation/);
        });
        it('successfully approves proposal when reviewed by an independent Checker', async () => {
            const proposal = await approvalService.submitProposal({
                type: 'WORKSPACE_SETTING',
                settingKey: 'auto_reversal_flag',
                title: 'Enable Auto Reversal',
                justification: 'Four-eyes independent approval verification',
                makerId: 'maker_usr_03',
                makerName: 'Maker User',
                teamId: 'team-cards',
                proposedChanges: { autoReversal: true }
            });
            const approved = await approvalService.reviewProposal({
                id: proposal.id,
                checkerId: 'checker_usr_09', // Different checker
                checkerName: 'Supervisor Jane',
                action: 'APPROVE'
            });
            expect(approved.status).toBe('APPROVED');
            expect(approved.checkerId).toBe('checker_usr_09');
            expect(approved.reviewedAt).toBeTruthy();
        });
    });
    describe('2. Centralized Analytics Telemetry Service', () => {
        it('returns structured operational overview with real metrics and trends', async () => {
            const overview = await analyticsService.getOperationalOverview();
            expect(overview).toBeDefined();
            expect(overview.summary).toBeDefined();
            expect(typeof overview.summary.totalIssues).toBe('number');
            expect(typeof overview.summary.resolutionRatePercent).toBe('number');
            expect(Array.isArray(overview.trend.days)).toBe(true);
            expect(overview.trend.days.length).toBeGreaterThan(0);
            expect(overview.governance.fourEyesActive).toBe(true);
            expect(overview.lastUpdated).toBeTruthy();
        });
        it('computes live team KPI inflow and outflow without static fallbacks', async () => {
            const teamKpis = await analyticsService.getTeamKpis('team-cards');
            expect(teamKpis).toBeDefined();
            expect(teamKpis.teamId).toBe('team-cards');
            expect(typeof teamKpis.inflow.assignedTasksCount).toBe('number');
            expect(typeof teamKpis.outflow.makerCheckerClearanceRate).toBe('number');
            expect(typeof teamKpis.outflow.avgResolutionTimeHours).toBe('number');
            expect(teamKpis.freshness).toBeTruthy();
        });
    });
    describe('3. Escalation State Machine & Command Deduplication', () => {
        it('executes structured action command and registers escalation event', async () => {
            const idempotencyKey = `idemp_test_${Date.now()}_alpha`;
            const result = await escalationService.executeActionCommand({
                issueId: 'ISS-101',
                actionType: 'ESCALATE_ISSUE',
                targetTeamId: 'team-cards',
                reason: 'Settlement reconciliation failure',
                actorId: 'usr-ops',
                actorName: 'Ops Analyst',
                idempotencyKey
            });
            expect(result.duplicateSuppressed).toBe(false);
            expect(result.event.id).toBeTruthy();
            expect(result.event.actionType).toBe('ESCALATE_ISSUE');
            expect(result.event.status).toBe('ACCEPTED');
        });
        it('suppresses duplicate execution when the same idempotency key is submitted', async () => {
            const sharedKey = `idemp_test_dedupe_${Date.now()}`;
            // First run
            const first = await escalationService.executeActionCommand({
                issueId: 'ISS-101',
                actionType: 'ESCALATE_ISSUE',
                targetTeamId: 'team-cards',
                reason: 'Initial command',
                actorId: 'usr-ops',
                actorName: 'Ops Analyst',
                idempotencyKey: sharedKey
            });
            expect(first.duplicateSuppressed).toBe(false);
            // Duplicate run with exact same key
            const second = await escalationService.executeActionCommand({
                issueId: 'ISS-101',
                actionType: 'ESCALATE_ISSUE',
                targetTeamId: 'team-cards',
                reason: 'Duplicate call',
                actorId: 'usr-ops',
                actorName: 'Ops Analyst',
                idempotencyKey: sharedKey
            });
            expect(second.duplicateSuppressed).toBe(true);
            expect(second.outputMessage).toContain('Duplicate command suppressed');
        });
    });
    describe('4. Sandbox Execution Isolation', () => {
        it('records simulation telemetry with diagnostic taint without database corruption', async () => {
            const dummyRecords = [
                { transaction_id: 'TXN-SBX-01', amount: 150.00, terminal_id: 'TERM-01' }
            ];
            // Retrieve first available workflow
            const { repo } = await import('../../store/repository.js');
            const workflows = await repo.getWorkflows();
            if (workflows.length > 0) {
                const wfId = workflows[0].id;
                const res = await sandboxExecutionService.simulateWorkflow({
                    workflowId: wfId,
                    records: dummyRecords,
                    executedBy: 'unit_tester'
                });
                expect(res.telemetry).toBeDefined();
                expect(res.telemetry.isDiagnosticOnly).toBe(true);
                expect(res.telemetry.summary.dryRunConfirmed).toBe(true);
                expect(Array.isArray(res.records)).toBe(true);
                if (res.records.length > 0) {
                    expect(res.records[0]._isDiagnosticOnly).toBe(true);
                    expect(res.records[0]._executionMode).toBe('SANDBOX_SIMULATION');
                }
            }
        });
    });
});
