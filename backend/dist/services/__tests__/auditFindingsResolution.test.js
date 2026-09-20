import { describe, it, expect } from 'vitest';
import { evaluateRuleCondition, executeWorkflowForTransaction } from '../investigationEngine.js';
import { ruleSqlCompiler } from '../ruleSqlCompiler.js';
import { investigationOrchestratorService } from '../investigationOrchestratorService.js';
const createStep = (overrides) => ({
    id: 'step-default',
    stepNumber: 1,
    name: 'Default Step',
    checkType: 'FIELD_COMPARATOR',
    targetDbId: 'db-default',
    targetTable: 'table-default',
    dependencyCondition: 'ALWAYS',
    onPassAction: 'CONTINUE',
    onFailAction: 'STOP',
    onErrorAction: 'STOP',
    ...overrides
});
describe('Audit Findings Resolution Suite', () => {
    describe('Finding W2: Unknown checkType must return ERROR', () => {
        it('returns status: ERROR for unknown checkType instead of passing', () => {
            const dummyRule = createStep({
                id: 'rule-unknown-1',
                name: 'Typo in Check Type',
                stepNumber: 1,
                checkType: 'EXISTANCE_CHECK', // Typo
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP'
            });
            const result = evaluateRuleCondition({ id: '123', amount: 100 }, dummyRule);
            expect(result.status).toBe('ERROR');
            expect(result.badgeText).toBe('Unknown Rule');
            expect(result.message).toContain('Unsupported or unknown rule checkType');
        });
    });
    describe('Finding W6: AMOUNT_MATCH target validation', () => {
        it('returns status: ERROR when AMOUNT_MATCH has no target or expected value', () => {
            const invalidRule = createStep({
                id: 'rule-amt-1',
                name: 'Amount Match No Target',
                stepNumber: 1,
                checkType: 'AMOUNT_MATCH',
                sourceField: 'amount',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP'
            });
            const result = evaluateRuleCondition({ amount: 500 }, invalidRule);
            expect(result.status).toBe('ERROR');
            expect(result.badgeText).toBe('Config Error');
            expect(result.message).toContain('requires targetField, compareValue, or expectedValue');
        });
        it('returns status: ERROR when AMOUNT_MATCH has no sourceField', () => {
            const invalidRule = createStep({
                id: 'rule-amt-2',
                name: 'Amount Match No Source',
                stepNumber: 1,
                checkType: 'AMOUNT_MATCH',
                expectedValue: '500',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP'
            });
            const result = evaluateRuleCondition({ amount: 500 }, invalidRule);
            expect(result.status).toBe('ERROR');
            expect(result.badgeText).toBe('Missing Source');
        });
        it('returns status: PASS when amounts reconcile with valid target', () => {
            const validRule = createStep({
                id: 'rule-amt-3',
                name: 'Amount Match Valid',
                stepNumber: 1,
                checkType: 'AMOUNT_MATCH',
                sourceField: 'amount',
                expectedValue: '500',
                toleranceMargin: 0.01,
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP'
            });
            const result = evaluateRuleCondition({ amount: 500 }, validRule);
            expect(result.status).toBe('PASS');
            expect(result.badgeText).toBe('Amount Match');
        });
    });
    describe('Finding W7: STATUS_MATCH & ISO_DECLINE_CODE sourceField requirements', () => {
        it('returns status: ERROR when STATUS_MATCH has no sourceField or targetField', () => {
            const rule = createStep({
                id: 'rule-sm-1',
                name: 'Status Match No Field',
                stepNumber: 1,
                checkType: 'STATUS_MATCH',
                compareValue: 'APPROVED',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP'
            });
            const result = evaluateRuleCondition({ status: 'APPROVED' }, rule);
            expect(result.status).toBe('ERROR');
            expect(result.badgeText).toBe('Missing Source');
        });
        it('returns status: ERROR when ISO_DECLINE_CODE has no sourceField', () => {
            const rule = createStep({
                id: 'rule-iso-1',
                name: 'ISO Decline No Field',
                stepNumber: 1,
                checkType: 'ISO_DECLINE_CODE',
                compareValue: '00',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP'
            });
            const result = evaluateRuleCondition({ response_code: '00' }, rule);
            expect(result.status).toBe('ERROR');
            expect(result.badgeText).toBe('Missing Source');
        });
    });
    describe('Finding W3: EXISTENCE_CHECK without target database', () => {
        it('returns status: ERROR when no target DB is configured rather than falsely passing', () => {
            const rule = createStep({
                id: 'rule-ex-1',
                name: 'Existence Check Unconfigured',
                stepNumber: 1,
                checkType: 'EXISTENCE_CHECK',
                sourceField: 'order_id',
                targetDbId: '', // Explicitly unconfigured
                targetTable: '',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP'
            });
            const result = evaluateRuleCondition({ order_id: 'ORD-12345' }, rule);
            expect(result.status).toBe('ERROR');
            expect(result.badgeText).toBe('No DB Attached');
        });
    });
    describe('Finding W5 & Finding 5: Skipped step status and no hardcoded remedy SQL', () => {
        it('records SKIPPED in audit trail and leaves remedySql undefined without card_number injection', () => {
            const workflow = {
                id: 'wf-test-audit',
                name: 'Audit Test Workflow',
                category: 'Custom',
                targetDbId: 'mock-db',
                targetTable: 'mock-table',
                stages: [],
                steps: [
                    createStep({
                        id: 'step-1',
                        name: 'First Step Failing But Continuing',
                        stepNumber: 1,
                        checkType: 'FIELD_COMPARATOR',
                        sourceField: 'status',
                        compareValue: 'ACTIVE',
                        onPassAction: 'CONTINUE',
                        onFailAction: 'CONTINUE'
                    }),
                    createStep({
                        id: 'step-2',
                        name: 'Dependent Step',
                        stepNumber: 2,
                        checkType: 'FIELD_COMPARATOR',
                        sourceField: 'amount',
                        compareValue: '100',
                        dependencyCondition: 'IF_PREV_SUCCESS',
                        onPassAction: 'CONTINUE',
                        onFailAction: 'STOP'
                    })
                ]
            };
            const record = {
                id: 'TXN-001',
                status: 'INACTIVE',
                amount: '100',
                card_number: '4111222233334444'
            };
            const summary = executeWorkflowForTransaction(record, workflow);
            // Step 2 should be marked SKIPPED, NOT FAIL
            const skippedStep = summary.auditTrail.find(a => a.ruleId === 'step-2');
            expect(skippedStep).toBeDefined();
            expect(skippedStep?.validationResult).toBe('SKIPPED');
            // remedySql must be undefined, never the raw UPDATE transactions SQL
            expect(summary.remedySql).toBeUndefined();
        });
    });
    describe('Finding W8: ruleSqlCompiler ANSI Quoting and Operator Safety', () => {
        it('quotes column identifiers with double quotes for PostgreSQL', () => {
            const rule = createStep({
                id: 'rule-sql-1',
                name: 'ANSI Quoting Check',
                stepNumber: 1,
                checkType: 'FIELD_COMPARATOR',
                sourceField: 'order',
                compareValue: 'ORD-999',
                comparator: 'EQUALS',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP'
            });
            const condition = ruleSqlCompiler.compileStepCondition(rule, 'm', ['order', 'amount']);
            expect(condition).toContain('m."order"');
        });
        it('restricts comparison operators to safe SQL set preventing operator breakout', () => {
            const rule = createStep({
                id: 'rule-sql-2',
                name: 'Operator Injection Attempt',
                stepNumber: 1,
                checkType: 'FIELD_COMPARATOR',
                sourceField: 'status',
                compareValue: 'ACTIVE',
                comparator: '= 1; DROP TABLE users; --',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP'
            });
            const condition = ruleSqlCompiler.compileStepCondition(rule, 'm', ['status']);
            expect(condition).not.toContain('DROP TABLE');
            expect(condition).toContain('=');
        });
    });
    describe('Finding 2 & 3: Universal Workflow Configuration Rigor', () => {
        it('throws Configuration Error when workflow has no determinable primary key', async () => {
            // Records with only underscore internal columns and no matching parameters
            const unresolvableRecords = [
                { _internal_row: 1, _created_at: '2026-01-01' }
            ];
            await expect(investigationOrchestratorService.executeUniversalWorkflow({
                workflowId: 'wf-1789852589770',
                records: unresolvableRecords,
                sourceType: 'INVESTIGATION_PANEL',
                sourceId: 'task-test-err',
                forceRerun: true
            })).rejects.toThrow('Configuration Error: Unable to determine primary key');
        });
    });
});
