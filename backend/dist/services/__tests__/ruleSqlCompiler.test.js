import { describe, it, expect } from 'vitest';
import { ruleSqlCompiler } from '../ruleSqlCompiler.js';
describe('ruleSqlCompiler', () => {
    describe('compileStepCondition', () => {
        it('compiles EXISTENCE_CHECK to _mirror_id IS NOT NULL', () => {
            const step = {
                id: 'step-1',
                stepNumber: 1,
                name: 'Check Record Exists',
                checkType: 'EXISTENCE_CHECK',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                requiredParams: [],
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP',
                onErrorAction: 'STOP',
                severityOnFailure: 'CRITICAL'
            };
            const sql = ruleSqlCompiler.compileStepCondition(step, 'm', ['transaction_id']);
            expect(sql).toBe('m._mirror_id IS NOT NULL');
        });
        it('compiles AMOUNT_MATCH with numeric tolerance', () => {
            const step = {
                id: 'step-2',
                stepNumber: 2,
                name: 'Match Amount',
                checkType: 'AMOUNT_MATCH',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                targetField: 'amount_usd',
                compareValue: '150.50',
                toleranceMargin: 0.05,
                requiredParams: [],
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP',
                onErrorAction: 'STOP',
                severityOnFailure: 'WARNING'
            };
            const sql = ruleSqlCompiler.compileStepCondition(step, 'm', ['amount_usd']);
            expect(sql).toContain('ABS(COALESCE((m."amount_usd")::numeric, 0) - 150.5) <= 0.05');
        });
        it('compiles FIELD_COMPARATOR with IN operator', () => {
            const step = {
                id: 'step-3',
                stepNumber: 3,
                name: 'Status In Set',
                checkType: 'FIELD_COMPARATOR',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                targetField: 'response_code',
                comparator: 'IN',
                compareValue: '00, 10, 20',
                requiredParams: [],
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP',
                onErrorAction: 'STOP',
                severityOnFailure: 'CRITICAL'
            };
            const sql = ruleSqlCompiler.compileStepCondition(step, 'm', ['response_code']);
            expect(sql).toContain("IN ('00', '10', '20')");
        });
        it('compiles FIELD_COMPARATOR with CONTAINS operator', () => {
            const step = {
                id: 'step-4',
                stepNumber: 4,
                name: 'Merchant Contains Name',
                checkType: 'FIELD_COMPARATOR',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                targetField: 'merchant_name',
                comparator: 'CONTAINS',
                compareValue: 'Acme',
                requiredParams: [],
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP',
                onErrorAction: 'STOP',
                severityOnFailure: 'WARNING'
            };
            const sql = ruleSqlCompiler.compileStepCondition(step, 'm', ['merchant_name']);
            expect(sql).toContain("LIKE '%acme%'");
        });
        it('compiles STATUS_MATCH with uppercase normalization', () => {
            const step = {
                id: 'step-5',
                stepNumber: 5,
                name: 'Verify Settled Status',
                checkType: 'STATUS_MATCH',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                targetField: 'status',
                compareValue: 'settled',
                requiredParams: [],
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP',
                onErrorAction: 'STOP',
                severityOnFailure: 'WARNING'
            };
            const sql = ruleSqlCompiler.compileStepCondition(step, 'm', ['status']);
            expect(sql).toBe("UPPER(COALESCE(m.\"status\"::text, '')) = 'SETTLED'");
        });
        it('sanitizes user input against SQL injection attempts', () => {
            const step = {
                id: 'step-6',
                stepNumber: 6,
                name: 'SQL Injection Test',
                checkType: 'FIELD_COMPARATOR',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                targetField: 'code',
                comparator: '=',
                compareValue: "'; DROP TABLE users; --",
                requiredParams: [],
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP',
                onErrorAction: 'STOP',
                severityOnFailure: 'CRITICAL'
            };
            const sql = ruleSqlCompiler.compileStepCondition(step, 'm', ['code']);
            expect(sql).toBe("COALESCE(m.\"code\"::text, '') = '''; DROP TABLE users; --'");
        });
        it('compiles DUAL_SOURCE_COMPARISON between input and mirror column', () => {
            const step = {
                id: 'step-7',
                stepNumber: 7,
                name: 'Cross Source Amount Match',
                checkType: 'DUAL_SOURCE_COMPARISON',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                dualSourceCondition: {
                    sourceA: { origin: 'INPUT', field: 'amount_usd' },
                    sourceB: { origin: 'MIRROR', field: 'amount' },
                    comparator: 'NUMERIC_TOLERANCE',
                    toleranceMargin: 0.01
                },
                requiredParams: [],
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP',
                onErrorAction: 'STOP',
                severityOnFailure: 'CRITICAL'
            };
            const sql = ruleSqlCompiler.compileStepCondition(step, 'm', ['amount'], 't');
            expect(sql).toContain('ABS(COALESCE(');
            expect(sql).toContain('<= 0.01');
        });
    });
    describe('compileBlockUpdateSql', () => {
        it('generates a complete set-based batch update statement', () => {
            const steps = [
                {
                    id: 'step-1',
                    stepNumber: 1,
                    name: 'Step One Check',
                    checkType: 'EXISTENCE_CHECK',
                    targetDbId: 'db-1',
                    targetTable: 'transactions',
                    requiredParams: [],
                    dependencyCondition: 'ALWAYS',
                    onPassAction: 'CONTINUE',
                    onFailAction: 'STOP',
                    onErrorAction: 'STOP',
                    severityOnFailure: 'CRITICAL'
                }
            ];
            const compiled = ruleSqlCompiler.compileBlockUpdateSql('mirror_db1_transactions', 'transaction_id', steps, ['transaction_id', 'amount_usd']);
            expect(compiled.fullUpdateSql).toContain('UPDATE mirror_db1_transactions m');
            expect(compiled.fullUpdateSql).toContain('SET');
            expect(compiled.fullUpdateSql).toContain('_validation_status = CASE');
            expect(compiled.fullUpdateSql).toContain('_validation_action = CASE');
            expect(compiled.fullUpdateSql).toContain('_validation_details = jsonb_build_object');
            expect(compiled.fullUpdateSql).toContain('WHERE m._batch_id = $1');
        });
    });
});
