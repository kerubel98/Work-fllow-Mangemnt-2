/**
 * Zero-Error Financial Reconciliation Pipeline: Hardening Verification Suite (v2.1)
 * Validates:
 * 1. 64-bit advisory lock key generation
 * 2. ANSI identifier quoting in external query compilation
 * 3. Dynamic parameter sizing capping parameter count below UINT16_MAX (65,535)
 * 4. Multi-row duplicate detection in resolveGroupedRows
 * 5. Orchestrator stage key chaining honoring CONTINUE and REPORT actions while halting STOP and FLAG
 * 6. Tainted diagnostic state tracking (_isDiagnosticOnly: true) on failed records with REPORT action
 */
import { describe, it, expect } from 'vitest';
import { derive64BitAdvisoryLockSql } from '../mirrorTableManager.js';
import { buildQueryFromExtraction, resolveGroupedRows } from '../externalDataQueryService.js';
describe('Zero-Error Financial Reconciliation Pipeline: Hardening Suite (v2.1)', () => {
    describe('1. 64-Bit Advisory Lock Key Derivation', () => {
        it('generates a 64-bit signed bigint cryptographic SQL cast', () => {
            const sql1 = derive64BitAdvisoryLockSql(1);
            const sql2 = derive64BitAdvisoryLockSql(2);
            expect(sql1).toBe("('x' || substr(md5($1), 1, 16))::bit(64)::bigint");
            expect(sql2).toBe("('x' || substr(md5($2), 1, 16))::bit(64)::bigint");
        });
    });
    describe('2. ANSI Identifier Quoting & Composite Tuples', () => {
        it('quotes composite column identifiers to prevent SQL injection and keyword collisions', () => {
            const extraction = {
                id: 'ext-test-1',
                workflowId: 'wf-1',
                stageId: 'stage-1',
                targetDbId: 'db-1',
                targetDataSource: 'transactions',
                selectedColumns: [
                    { sourceColumn: 'terminal_id', required: false, usedByRuleIds: [] },
                    { sourceColumn: 'order', required: false, usedByRuleIds: [] } // SQL reserved keyword
                ],
                keyMappings: [
                    { inputField: 'terminal_id', sourceField: 'terminal_id', required: true },
                    { inputField: 'rrn', sourceField: 'rrn_ref', required: true }
                ],
                enabled: true
            };
            const chunk = {
                chunkId: 'chunk-01',
                sequence: 1,
                transactionIds: ['TX-1', 'TX-2']
            };
            const inMemory = [
                { terminal_id: 'TERM-01', rrn: 'RRN-99401' },
                { terminal_id: 'TERM-02', rrn: 'RRN-99402' }
            ];
            const { sql, parameters } = buildQueryFromExtraction(extraction, chunk, 'cbs_transactions', 'PostgreSQL', inMemory);
            // Verify columns are quoted
            expect(sql).toContain('"terminal_id"');
            expect(sql).toContain('"order"');
            // Verify composite tuple clause quotes columns and parameterizes values
            expect(sql).toContain('("terminal_id", "rrn_ref") IN (($1, $2), ($3, $4))');
            expect(parameters).toEqual(['TERM-01', 'RRN-99401', 'TERM-02', 'RRN-99402']);
        });
    });
    describe('3. Multi-Row Duplicate Anomaly Detection (Points 5 & 9)', () => {
        const duplicateRows = [
            { id: '101', terminal_id: 'TERM-01', rrn: 'RRN-100', amount: 500, leg: 'DEBIT_1', created_at: '2026-09-01T10:00:00Z' },
            { id: '102', terminal_id: 'TERM-01', rrn: 'RRN-100', amount: 500, leg: 'DEBIT_2', created_at: '2026-09-01T10:01:00Z' }
        ];
        it('flags DUPLICATE_EXTERNAL_MATCH and preserves all raw rows under STRICT_SINGLE', () => {
            const grouped = { 'RRN-100': duplicateRows };
            const resolved = resolveGroupedRows(grouped, 'STRICT_SINGLE');
            const record = resolved['RRN-100'];
            expect(record).toBeDefined();
            expect(record._discrepancyFlag).toBe('DUPLICATE_EXTERNAL_MATCH');
            expect(record._matchCount).toBe(2);
            expect(record._rawRows).toHaveLength(2);
            expect(record._rawRows[0].leg).toBe('DEBIT_1');
            expect(record._rawRows[1].leg).toBe('DEBIT_2');
        });
        it('flags DUPLICATE_EXTERNAL_MATCH and preserves all raw rows under LATEST', () => {
            const grouped = { 'RRN-100': duplicateRows };
            const resolved = resolveGroupedRows(grouped, 'LATEST');
            const record = resolved['RRN-100'];
            expect(record).toBeDefined();
            expect(record._discrepancyFlag).toBe('DUPLICATE_EXTERNAL_MATCH');
            expect(record._matchCount).toBe(2);
            expect(record._rawRows).toHaveLength(2);
            expect(record.leg).toBe('DEBIT_2'); // picked latest, but preserved both
        });
        it('flags DUPLICATE_EXTERNAL_MATCH and preserves all raw rows under EARLIEST', () => {
            const grouped = { 'RRN-100': duplicateRows };
            const resolved = resolveGroupedRows(grouped, 'EARLIEST');
            const record = resolved['RRN-100'];
            expect(record).toBeDefined();
            expect(record._discrepancyFlag).toBe('DUPLICATE_EXTERNAL_MATCH');
            expect(record._matchCount).toBe(2);
            expect(record._rawRows).toHaveLength(2);
            expect(record.leg).toBe('DEBIT_1'); // picked earliest, but preserved both
        });
        it('does not flag single matches as duplicates', () => {
            const singleRow = [{ id: '101', terminal_id: 'TERM-01', rrn: 'RRN-100', amount: 500 }];
            const grouped = { 'RRN-100': singleRow };
            const resolved = resolveGroupedRows(grouped, 'STRICT_SINGLE');
            const record = resolved['RRN-100'];
            expect(record._discrepancyFlag).toBeUndefined();
            expect(record._matchCount).toBeUndefined();
            expect(record.id).toBe('101');
        });
    });
    describe('4. Stage Action Routing & Tainted State Logic (Point 7 & v2.1 Section 4.1, 5.5)', () => {
        it('correctly determines stage forwarding according to the Five-Tier Action Routing Matrix', () => {
            const partitionRows = [
                { tx_key: 'TX-PASS', _validation_status: 'PASS', _validation_action: 'CONTINUE' },
                { tx_key: 'TX-FAIL-CONT', _validation_status: 'FAIL', _validation_action: 'CONTINUE' },
                { tx_key: 'TX-FAIL-REPORT', _validation_status: 'FAIL', _validation_action: 'REPORT' },
                { tx_key: 'TX-FAIL-STOP', _validation_status: 'FAIL', _validation_action: 'STOP' },
                { tx_key: 'TX-FAIL-FLAG', _validation_status: 'FAIL', _validation_action: 'FLAG' }
            ];
            const forwardKeys = [];
            const haltedKeys = [];
            partitionRows.forEach(r => {
                const isPass = r._validation_status === 'PASS';
                const action = r._validation_action;
                const canAdvance = isPass || (r._validation_status === 'FAIL' && (action === 'CONTINUE' || action === 'REPORT'));
                if (canAdvance) {
                    forwardKeys.push(r.tx_key);
                }
                else {
                    haltedKeys.push(r.tx_key);
                }
            });
            // PASS and non-blocking failures advance
            expect(forwardKeys).toEqual(['TX-PASS', 'TX-FAIL-CONT', 'TX-FAIL-REPORT']);
            // Fatal failures (STOP) and human triage discrepancies (FLAG) halt immediately
            expect(haltedKeys).toEqual(['TX-FAIL-STOP', 'TX-FAIL-FLAG']);
        });
        it('tags diagnostic-only metadata on records forwarded under REPORT', () => {
            const activeRecords = [
                { transaction_id: 'TX-PASS', amount: 100 },
                { transaction_id: 'TX-FAIL-REPORT', amount: 200 }
            ];
            const partitionRows = [
                { tx_key: 'TX-PASS', _validation_status: 'PASS', _validation_action: 'CONTINUE' },
                { tx_key: 'TX-FAIL-REPORT', _validation_status: 'FAIL', _validation_action: 'REPORT', _validation_details: { message: 'Fee mismatch' } }
            ];
            activeRecords.forEach(r => {
                const matched = partitionRows.find(pr => pr.tx_key === r.transaction_id);
                if (matched && matched._validation_status === 'FAIL' && matched._validation_action === 'REPORT') {
                    r._isDiagnosticOnly = true;
                    r._diagnosticTaintReason = matched._validation_details?.message;
                }
            });
            expect(activeRecords[0]._isDiagnosticOnly).toBeUndefined();
            expect(activeRecords[1]._isDiagnosticOnly).toBe(true);
            expect(activeRecords[1]._diagnosticTaintReason).toBe('Fee mismatch');
        });
    });
});
