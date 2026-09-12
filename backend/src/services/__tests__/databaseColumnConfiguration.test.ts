import { describe, it, expect, beforeAll } from 'vitest';
import { repo } from '../../store/repository.js';
import { DatabaseColumnConfiguration } from '../../types.js';

describe('Database Column Configurations & Priority Rules Engine', () => {
  const testConfig: DatabaseColumnConfiguration = {
    id: `cfg-test-${Date.now()}`,
    name: 'RRN + Amount Priority Duplicate Check',
    dbId: 'db-1',
    dbName: 'Core Payment DB',
    tableName: 'transactions',
    ruleType: 'DUPLICATE_CHECK',
    description: 'Detects duplicate transactions using priority column hierarchy',
    columns: [
      {
        columnName: 'rrn',
        priority: 1,
        role: 'MATCH_KEY',
        matchMode: 'EXACT',
        transform: 'NONE'
      },
      {
        columnName: 'amount',
        priority: 2,
        role: 'DISCRIMINATOR',
        matchMode: 'EXACT',
        transform: 'NONE'
      }
    ],
    groupByColumns: [],
    aggregationRules: [],
    violationAction: 'STOP',
    severity: 'CRITICAL',
    violationMessage: 'Duplicate transaction detected across priority keys',
    isActive: true,
    createdBy: 'vitest-suite',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  it('successfully persists and retrieves a new column configuration', async () => {
    const saved = await repo.createColumnConfiguration(testConfig);
    expect(saved).toBeDefined();
    expect(saved.id).toBe(testConfig.id);
    expect(saved.name).toBe(testConfig.name);
    expect(saved.columns.length).toBe(2);
    expect(saved.columns[0].priority).toBe(1);

    const fetched = await repo.getColumnConfigurationById(testConfig.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.tableName).toBe('transactions');
  });

  it('filters column configurations by dbId and tableName', async () => {
    const list = await repo.getColumnConfigurations('db-1', 'transactions');
    expect(Array.isArray(list)).toBe(true);
    const found = list.find(c => c.id === testConfig.id);
    expect(found).toBeDefined();
  });

  it('evaluates duplicate checks on sample rows according to priority column ranking', () => {
    const sampleRows = [
      { id: '1', rrn: '990011', amount: '150.00', status: 'SUCCESS' },
      { id: '2', rrn: '990011', amount: '150.00', status: 'FAILED' }, // duplicate with row 1 on (rrn, amount)
      { id: '3', rrn: '990012', amount: '150.00', status: 'SUCCESS' }, // different rrn
      { id: '4', rrn: '990013', amount: '200.00', status: 'SUCCESS' }
    ];

    // Simulate duplicate evaluation
    const keyMap = new Map<string, number[]>();
    sampleRows.forEach((row, idx) => {
      const compositeKey = testConfig.columns
        .sort((a, b) => a.priority - b.priority)
        .map(c => `${c.columnName}=${(row as any)[c.columnName]}`)
        .join(' | ');

      const list = keyMap.get(compositeKey) || [];
      list.push(idx);
      keyMap.set(compositeKey, list);
    });

    const duplicateRows: number[] = [];
    keyMap.forEach((indices) => {
      if (indices.length > 1) {
        duplicateRows.push(...indices);
      }
    });

    expect(duplicateRows.length).toBe(2);
    expect(duplicateRows).toContain(0);
    expect(duplicateRows).toContain(1);
  });

  it('requires at least one column in DUPLICATE_CHECK and evaluates duplicate values and occurrence counts', () => {
    // 1. Zero columns must be rejected / flagged
    const emptyConfig: Partial<DatabaseColumnConfiguration> = {
      ruleType: 'DUPLICATE_CHECK',
      columns: []
    };
    const hasColumns = (cfg: Partial<DatabaseColumnConfiguration>) => Array.isArray(cfg.columns) && cfg.columns.length > 0;
    expect(hasColumns(emptyConfig)).toBe(false);

    // 2. Evaluates value match and count threshold
    const sampleRows = [
      { rrn: 'TXN-101', amount: '100' },
      { rrn: 'TXN-101', amount: '100' },
      { rrn: 'TXN-101', amount: '100' }, // rrn TXN-101 count = 3
      { rrn: 'TXN-102', amount: '200' }  // rrn TXN-102 count = 1
    ];

    const dupConfig: Partial<DatabaseColumnConfiguration> = {
      ruleType: 'DUPLICATE_CHECK',
      columns: [{ columnName: 'rrn', priority: 1, role: 'MATCH_KEY' }],
      aggregationRules: [{ function: 'COUNT', operator: '>', value: 1 }]
    };

    expect(hasColumns(dupConfig)).toBe(true);

    const groups = new Map<string, number[]>();
    sampleRows.forEach((row, idx) => {
      const k = `rrn=${row.rrn}`;
      const l = groups.get(k) || [];
      l.push(idx);
      groups.set(k, l);
    });

    const violations: any[] = [];
    const passed: any[] = [];
    const threshold = dupConfig.aggregationRules![0].value;

    groups.forEach((indices, key) => {
      const count = indices.length;
      if (count > threshold) {
        indices.forEach(i => violations.push({ index: i, value: key, count }));
      } else {
        indices.forEach(i => passed.push({ index: i, value: key, count }));
      }
    });

    expect(violations.length).toBe(3);
    expect(violations[0].count).toBe(3);
    expect(violations[0].value).toBe('rrn=TXN-101');
    expect(passed.length).toBe(1);
    expect(passed[0].count).toBe(1);
    expect(passed[0].value).toBe('rrn=TXN-102');
  });

  it('evaluates grouping check criteria correctly', () => {
    const groupingConfig: Partial<DatabaseColumnConfiguration> = {
      ruleType: 'GROUPING_CHECK',
      groupByColumns: ['batch_id'],
      columns: [{ columnName: 'amount', priority: 1 }],
      aggregationRules: [{ function: 'COUNT', operator: '>', value: 2 }]
    };

    const rows = [
      { id: '1', batch_id: 'B-01', amount: '10' },
      { id: '2', batch_id: 'B-01', amount: '20' },
      { id: '3', batch_id: 'B-01', amount: '30' }, // batch B-01 has count 3 > 2 (Violation)
      { id: '4', batch_id: 'B-02', amount: '40' }  // batch B-02 has count 1 <= 2 (OK)
    ];

    const groups = new Map<string, number[]>();
    rows.forEach((r, i) => {
      const k = `batch_id=${r.batch_id}`;
      const l = groups.get(k) || [];
      l.push(i);
      groups.set(k, l);
    });

    const flaggedIndices: number[] = [];
    groups.forEach((indices) => {
      if (indices.length > 2) {
        flaggedIndices.push(...indices);
      }
    });

    expect(flaggedIndices.length).toBe(3);
    expect(flaggedIndices).toEqual([0, 1, 2]);
  });

  it('correctly treats satisfied equality aggregation criterion as PASS and not violation', () => {
    // When a user asserts COUNT(*) = 3, having 3 items satisfies the criterion (PASS).
    // Having != 3 items violates the criterion (VIOLATION).
    const evaluateAggregate = (count: number, op: string, target: number) => {
      if (op === '=' || op === '==') return count === target;
      if (op === '!=') return count !== target;
      if (op === '>') return count > target;
      if (op === '>=') return count >= target;
      if (op === '<') return count < target;
      if (op === '<=') return count <= target;
      return count === target;
    };

    // Group with 3 items under COUNT = 3
    const satisfied = evaluateAggregate(3, '=', 3);
    expect(satisfied).toBe(true); // Must NOT be a violation

    // Group with 2 items under COUNT = 3
    const dissatisfied = evaluateAggregate(2, '=', 3);
    expect(dissatisfied).toBe(false); // Must be a violation
  });

  it('evaluates multi-row transaction semantic interpretation and cross-row assertions', async () => {
    const semanticConfig: DatabaseColumnConfiguration = {
      id: `semantic-${Date.now()}`,
      name: 'Double-Entry Settlement Leg Validation',
      dbId: 'db-settlement-1',
      dbName: 'Core Banking',
      tableName: 'account_postings',
      ruleType: 'MULTI_ROW_SEMANTIC_CHECK',
      description: 'Verifies paired debit/credit legs and equal amounts per transaction ID',
      columns: [{ columnName: 'trans_id', priority: 1, role: 'MATCH_KEY' }],
      primaryKeyColumn: 'trans_id',
      roleColumn: 'entry_type',
      semanticRoles: [
        { roleName: 'Debit', matchValues: ['DR', 'DEBIT', '01'], color: 'amber' },
        { roleName: 'Credit', matchValues: ['CR', 'CREDIT', '02'], color: 'emerald' },
        { roleName: 'Reversal', matchValues: ['REV', 'REVERSAL'], color: 'rose' }
      ],
      crossRowRules: [
        {
          id: 'rule-exist-1',
          ruleType: 'ROLE_EXISTENCE',
          primaryRole: 'Debit',
          targetRole: 'Credit',
          description: 'Debit must have a matching Credit leg'
        },
        {
          id: 'rule-match-1',
          ruleType: 'VALUE_MATCH',
          primaryRole: 'Debit',
          targetRole: 'Credit',
          valueColumn: 'amount',
          targetValueColumn: 'amount',
          tolerance: 0,
          description: 'Debit amount must equal Credit amount'
        }
      ],
      groupByColumns: [],
      aggregationRules: [],
      violationAction: 'FLAG',
      severity: 'CRITICAL',
      violationMessage: 'Broken double-entry transaction leg detected',
      isActive: true,
      createdBy: 'test-runner'
    };

    // Save and retrieve from repository to verify persistence of all semantic columns
    const saved = await repo.createColumnConfiguration(semanticConfig);
    expect(saved.primaryKeyColumn).toBe('trans_id');
    expect(saved.roleColumn).toBe('entry_type');
    expect(saved.semanticRoles?.length).toBe(3);
    expect(saved.crossRowRules?.length).toBe(2);

    const retrieved = await repo.getColumnConfigurationById(semanticConfig.id);
    expect(retrieved?.primaryKeyColumn).toBe('trans_id');
    expect(retrieved?.roleColumn).toBe('entry_type');
    expect(retrieved?.semanticRoles?.[0].roleName).toBe('Debit');
    expect(retrieved?.crossRowRules?.[1].ruleType).toBe('VALUE_MATCH');

    // Simulate multi-row data
    const txRows = [
      // Tx 101: Balanced (DR 500, CR 500) -> PASS
      { trans_id: 'TX101', entry_type: 'DR', amount: 500 },
      { trans_id: 'TX101', entry_type: 'CR', amount: 500 },

      // Tx 102: Missing Credit leg (DR 200, no CR) -> VIOLATION: ROLE_EXISTENCE
      { trans_id: 'TX102', entry_type: 'DR', amount: 200 },

      // Tx 103: Amount mismatch (DR 300, CR 290) -> VIOLATION: VALUE_MATCH
      { trans_id: 'TX103', entry_type: 'DR', amount: 300 },
      { trans_id: 'TX103', entry_type: 'CR', amount: 290 }
    ];

    // Helper evaluation
    const resolveRole = (row: any) => {
      const val = String(row.entry_type || '').toUpperCase();
      for (const r of semanticConfig.semanticRoles || []) {
        if (r.matchValues.includes(val)) return r.roleName;
      }
      return val;
    };

    const grouped = new Map<string, any[]>();
    txRows.forEach(r => {
      const list = grouped.get(r.trans_id) || [];
      list.push(r);
      grouped.set(r.trans_id, list);
    });

    const failedTxIds: string[] = [];
    grouped.forEach((rows, txId) => {
      const roles = new Set(rows.map(resolveRole));
      // Existence check
      if (roles.has('Debit') && !roles.has('Credit')) {
        failedTxIds.push(`${txId}_MISSING_CREDIT`);
      }
      // Value match check
      const drRow = rows.find(r => resolveRole(r) === 'Debit');
      const crRow = rows.find(r => resolveRole(r) === 'Credit');
      if (drRow && crRow && Number(drRow.amount) !== Number(crRow.amount)) {
        failedTxIds.push(`${txId}_AMOUNT_MISMATCH`);
      }
    });

    expect(failedTxIds).toContain('TX102_MISSING_CREDIT');
    expect(failedTxIds).toContain('TX103_AMOUNT_MISMATCH');
    expect(failedTxIds.some(id => id.startsWith('TX101'))).toBe(false);

    // Clean up
    await repo.deleteColumnConfiguration(semanticConfig.id);
  });

  it('updates and deletes column configurations cleanly', async () => {
    const updated = await repo.updateColumnConfiguration(testConfig.id, {
      description: 'Updated description for test rule',
      violationAction: 'REPORT'
    });
    expect(updated?.description).toBe('Updated description for test rule');
    expect(updated?.violationAction).toBe('REPORT');

    const deleted = await repo.deleteColumnConfiguration(testConfig.id);
    expect(deleted).toBe(true);

    const check = await repo.getColumnConfigurationById(testConfig.id);
    expect(check).toBeNull();
  });

  it('persists and evaluates multi-column Type Groups and per-type leg relationship rules (TYPE_RELATION_CHECK)', async () => {
    const typeGroupConfig: DatabaseColumnConfiguration = {
      id: `type-group-${Date.now()}`,
      name: 'Multi-Leg Transaction Type Groups Rule',
      dbId: 'db-payments-main',
      dbName: 'Payment Switch DB',
      tableName: 'settlement_journal',
      ruleType: 'TYPE_RELATION_CHECK',
      description: 'Validates leg counts and balance relationships per transaction type group classified by multiple columns',
      columns: [{ columnName: 'trace_num', priority: 1, role: 'MATCH_KEY' }],
      primaryKeyColumn: 'trace_num',
      roleColumn: 'leg_type',
      typeGroupColumns: ['channel', 'msg_type'],
      typeGroups: [
        {
          id: 'tg-atm-cash',
          groupName: 'ATM Cash Withdrawal',
          description: 'ATM withdrawal requires exactly 2 legs (Host Debit + ATM Dispense) and matching amount',
          conditions: [
            { columnName: 'channel', operator: '=', value: 'ATM' },
            { columnName: 'msg_type', operator: 'IN', value: '0200,WITHDRAWAL' }
          ],
          expectedLegCount: { operator: '==', value: 2 },
          roles: [
            { roleName: 'CustomerDebit', matchValues: ['DR', 'DEBIT_CUSTOMER'] },
            { roleName: 'TerminalCredit', matchValues: ['CR', 'CREDIT_TERMINAL'] }
          ],
          legRelationships: [
            {
              id: 'atm-leg-rel-1',
              ruleType: 'VALUE_MATCH',
              primaryRole: 'CustomerDebit',
              targetRole: 'TerminalCredit',
              valueColumn: 'amount',
              targetValueColumn: 'amount',
              tolerance: 0
            }
          ]
        },
        {
          id: 'tg-pos-purchase',
          groupName: 'POS Purchase',
          description: 'POS Purchase requires 2 legs and Net Balance = 0',
          conditions: [
            { columnName: 'channel', operator: '=', value: 'POS' },
            { columnName: 'msg_type', operator: '=', value: 'PURCHASE' }
          ],
          expectedLegCount: { operator: '==', value: 2 },
          legRelationships: [
            {
              id: 'pos-leg-rel-1',
              ruleType: 'NET_BALANCE',
              primaryRole: 'Debit',
              targetRole: 'Credit',
              valueColumn: 'amount',
              tolerance: 0
            }
          ]
        }
      ],
      violationAction: 'FLAG',
      severity: 'CRITICAL',
      violationMessage: 'Transaction leg relation violated',
      isActive: true,
      createdBy: 'test-runner'
    };

    // 1. Persistence verification
    const saved = await repo.createColumnConfiguration(typeGroupConfig);
    expect(saved.typeGroups?.length).toBe(2);
    expect(saved.typeGroups?.[0].groupName).toBe('ATM Cash Withdrawal');
    expect(saved.typeGroups?.[0].conditions.length).toBe(2);
    expect(saved.typeGroupColumns).toContain('channel');
    expect(saved.typeGroupColumns).toContain('msg_type');

    const fetched = await repo.getColumnConfigurationById(typeGroupConfig.id);
    expect(fetched?.typeGroups?.length).toBe(2);
    expect(fetched?.typeGroups?.[0].expectedLegCount?.value).toBe(2);
    expect(fetched?.typeGroups?.[0].legRelationships?.[0].ruleType).toBe('VALUE_MATCH');

    // 2. Data evaluation simulation
    const testRows = [
      // Trace 1001: ATM Cash Withdrawal (Channel=ATM, Msg=0200) -> 2 legs, 1000 each -> PASS
      { trace_num: '1001', channel: 'ATM', msg_type: '0200', leg_type: 'DR', amount: 1000 },
      { trace_num: '1001', channel: 'ATM', msg_type: '0200', leg_type: 'CR', amount: 1000 },

      // Trace 1002: ATM Cash Withdrawal -> 1 leg only -> VIOLATION: expectedLegCount 2 vs 1
      { trace_num: '1002', channel: 'ATM', msg_type: '0200', leg_type: 'DR', amount: 500 },

      // Trace 1003: ATM Cash Withdrawal -> 2 legs, amount mismatch 800 vs 750 -> VIOLATION: leg amount mismatch
      { trace_num: '1003', channel: 'ATM', msg_type: 'WITHDRAWAL', leg_type: 'DR', amount: 800 },
      { trace_num: '1003', channel: 'ATM', msg_type: 'WITHDRAWAL', leg_type: 'CR', amount: 750 }
    ];

    // Evaluate multi-column conditions for each transaction
    const findGroup = (rows: any[]) => {
      for (const tg of typeGroupConfig.typeGroups || []) {
        const matches = rows.some(r =>
          tg.conditions.every(c => {
            const val = String((r as any)[c.columnName] || '');
            if (c.operator === '=') return val === c.value;
            if (c.operator === 'IN') return c.value.split(',').includes(val);
            return false;
          })
        );
        if (matches) return tg;
      }
      return null;
    };

    const traces = new Map<string, any[]>();
    testRows.forEach(r => {
      const list = traces.get(r.trace_num) || [];
      list.push(r);
      traces.set(r.trace_num, list);
    });

    const violationsFound: string[] = [];
    traces.forEach((rows, trace) => {
      const tg = findGroup(rows);
      expect(tg).not.toBeNull();
      if (!tg) return;

      // Check leg count
      if (tg.expectedLegCount && rows.length !== tg.expectedLegCount.value) {
        violationsFound.push(`LEG_COUNT_MISMATCH_${trace}`);
      }

      // Check leg amount equality
      if (tg.legRelationships) {
        for (const rel of tg.legRelationships) {
          if (rel.ruleType === 'VALUE_MATCH') {
            const legA = rows.find(r => ['DR', 'DEBIT_CUSTOMER'].includes(r.leg_type));
            const legB = rows.find(r => ['CR', 'CREDIT_TERMINAL'].includes(r.leg_type));
            if (legA && legB && Number(legA.amount) !== Number(legB.amount)) {
              violationsFound.push(`LEG_AMOUNT_MISMATCH_${trace}`);
            }
          }
        }
      }
    });

    expect(violationsFound).toContain('LEG_COUNT_MISMATCH_1002');
    expect(violationsFound).toContain('LEG_AMOUNT_MISMATCH_1003');
    expect(violationsFound.some(v => v.includes('1001'))).toBe(false);

    // Clean up
    await repo.deleteColumnConfiguration(typeGroupConfig.id);
  });

  it('should persist and evaluate VALUE_LABEL_CHECK (Value Labeling & Interpretation)', async () => {
    const valueLabelConfig: DatabaseColumnConfiguration = {
      id: `test-val-label-${Date.now()}`,
      name: 'Response Code Business Interpretation',
      dbId: 'db-test-core',
      tableName: 'iso_transactions',
      ruleType: 'VALUE_LABEL_CHECK',
      description: 'Interpret ISO-8583 response codes into human business meanings and flag unmapped or error codes',
      columns: [
        { columnName: 'resp_code', priority: 1, role: 'DISCRIMINATOR' }
      ],
      primaryKeyColumn: 'resp_code',
      valueLabels: [
        { value: '00', label: 'Approved', category: 'VALID', description: 'Transaction successfully authorized' },
        { value: '51', label: 'Insufficient Funds', category: 'WARNING', description: 'Customer balance low' },
        { value: '91', label: 'System Timeout / Switch Inoperative', category: 'ERROR', description: 'Upstream gateway down' }
      ],
      unmappedValueAction: 'FLAG',
      violationAction: 'FLAG',
      severity: 'CRITICAL',
      violationMessage: 'Invalid or error response code detected',
      isActive: true,
      createdBy: 'test-runner'
    };

    // 1. Persistence verification
    const saved = await repo.createColumnConfiguration(valueLabelConfig);
    expect(saved.ruleType).toBe('VALUE_LABEL_CHECK');
    expect(saved.valueLabels?.length).toBe(3);
    expect(saved.valueLabels?.[0].label).toBe('Approved');
    expect(saved.valueLabels?.[2].category).toBe('ERROR');
    expect(saved.unmappedValueAction).toBe('FLAG');

    const fetched = await repo.getColumnConfigurationById(valueLabelConfig.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.valueLabels?.length).toBe(3);
    expect(fetched?.unmappedValueAction).toBe('FLAG');

    // 2. Evaluation logic
    const testRows = [
      { id: '1', resp_code: '00', amount: 150 },   // Valid / Approved
      { id: '2', resp_code: '51', amount: 200 },   // Warning (insufficient funds)
      { id: '3', resp_code: '91', amount: 350 },   // Error (switch inoperative) -> Violation
      { id: '4', resp_code: '99', amount: 500 }    // Unmapped code -> Violation
    ];

    const labelMap = new Map(valueLabelConfig.valueLabels!.map(m => [m.value, m]));
    const violations: any[] = [];

    testRows.forEach((row, idx) => {
      const code = String(row.resp_code);
      const matched = labelMap.get(code);

      if (!matched) {
        if (valueLabelConfig.unmappedValueAction === 'FLAG') {
          violations.push({ rowIndex: idx, reason: `Unrecognized / Unlabeled value "${code}"` });
        }
      } else {
        if (matched.category === 'ERROR') {
          violations.push({ rowIndex: idx, reason: `Classified as ERROR: ${matched.label}` });
        }
      }
    });

    expect(violations.length).toBe(2);
    expect(violations[0].rowIndex).toBe(2); // row 3: resp_code 91
    expect(violations[0].reason).toContain('Classified as ERROR: System Timeout');
    expect(violations[1].rowIndex).toBe(3); // row 4: resp_code 99
    expect(violations[1].reason).toContain('Unrecognized / Unlabeled value "99"');

    // Clean up
    await repo.deleteColumnConfiguration(valueLabelConfig.id);
  });

  it('evaluates GROUPING_CHECK with Type Groups and properly raises violations on type group failures', async () => {
    const groupingWithTypesConfig: DatabaseColumnConfiguration = {
      id: `group-types-${Date.now()}`,
      name: 'Batch Settlement Grouping Check with Type Groups',
      dbId: 'db-core-group',
      tableName: 'settlement_journal',
      ruleType: 'GROUPING_CHECK',
      description: 'Groups by journal_id and applies type group validations (leg count, role matching, and value match)',
      columns: [
        { columnName: 'journal_id', priority: 1, role: 'MATCH_KEY' },
        { columnName: 'entry_type', priority: 2, role: 'DISCRIMINATOR' }
      ],
      groupByColumns: ['journal_id'],
      roleColumn: 'entry_type',
      typeGroups: [
        {
          id: 'tg-transfer',
          groupName: 'Transfer Pair',
          conditions: [
            { columnName: 'channel', operator: '=', value: 'ATM' }
          ],
          expectedLegCount: { operator: '==', value: 2 },
          roles: [
            { roleName: 'Debit', matchValues: ['DR'] },
            { roleName: 'Credit', matchValues: ['CR'] }
          ],
          legRelationships: [
            {
              id: 'lr-match',
              ruleType: 'VALUE_MATCH',
              primaryRole: 'Debit',
              targetRole: 'Credit',
              valueColumn: 'amount',
              tolerance: 0
            }
          ]
        }
      ],
      violationAction: 'FLAG',
      severity: 'CRITICAL',
      violationMessage: 'Type group validation failed for journal',
      isActive: true,
      createdBy: 'test-runner'
    };

    // Save and retrieve
    await repo.createColumnConfiguration(groupingWithTypesConfig);
    const retrieved = await repo.getColumnConfigurationById(groupingWithTypesConfig.id);
    expect(retrieved?.typeGroups?.length).toBe(1);
    expect(retrieved?.typeGroups?.[0].groupName).toBe('Transfer Pair');

    const sampleRows = [
      // Journal J-01: ATM channel, 2 legs (DR 500, CR 500) -> PASS
      { journal_id: 'J-01', channel: 'ATM', entry_type: 'DR', amount: 500 },
      { journal_id: 'J-01', channel: 'ATM', entry_type: 'CR', amount: 500 },

      // Journal J-02: ATM channel, 3 legs (DR 100, CR 100, DR 50) -> FAIL expectedLegCount (expected 2, found 3)
      { journal_id: 'J-02', channel: 'ATM', entry_type: 'DR', amount: 100 },
      { journal_id: 'J-02', channel: 'ATM', entry_type: 'CR', amount: 100 },
      { journal_id: 'J-02', channel: 'ATM', entry_type: 'DR', amount: 50 },

      // Journal J-03: ATM channel, 2 legs (DR 200, CR 190) -> FAIL VALUE_MATCH (diff 10)
      { journal_id: 'J-03', channel: 'ATM', entry_type: 'DR', amount: 200 },
      { journal_id: 'J-03', channel: 'ATM', entry_type: 'CR', amount: 190 },

      // Journal J-04: WEB channel (unclassified! does not match channel=ATM) -> FAIL Unclassified Group
      { journal_id: 'J-04', channel: 'WEB', entry_type: 'DR', amount: 300 }
    ];

    // Simulate the exact logic in database.ts for GROUPING_CHECK
    const groups = new Map<string, number[]>();
    sampleRows.forEach((r, idx) => {
      const k = `journal_id=${r.journal_id}`;
      const l = groups.get(k) || [];
      l.push(idx);
      groups.set(k, l);
    });

    const evaluatedViolations: Array<{ groupKey: string; reason: string }> = [];
    const passedGroups: string[] = [];

    groups.forEach((indices, groupKey) => {
      const groupRows = indices.map(i => sampleRows[i]);
      let groupHasViolation = false;

      // Find matching type group
      const matchedType = groupingWithTypesConfig.typeGroups?.find(tg =>
        groupRows.some(row => (tg.conditions || []).every(cond => String(row[cond.columnName as keyof typeof row]).trim().toLowerCase() === String(cond.value).trim().toLowerCase()))
      );

      if (!matchedType) {
        evaluatedViolations.push({
          groupKey,
          reason: `Unclassified Group [${groupKey}]`
        });
        return;
      }

      // Expected leg count
      if (matchedType.expectedLegCount && indices.length !== matchedType.expectedLegCount.value) {
        groupHasViolation = true;
        evaluatedViolations.push({
          groupKey,
          reason: `Type Group "${matchedType.groupName}" requires == ${matchedType.expectedLegCount.value} legs, but found ${indices.length}`
        });
      }

      // Leg relationship VALUE_MATCH
      if (matchedType.legRelationships) {
        matchedType.legRelationships.forEach(lr => {
          if (lr.ruleType === 'VALUE_MATCH') {
            const dr = groupRows.find(r => r.entry_type === 'DR');
            const cr = groupRows.find(r => r.entry_type === 'CR');
            if (dr && cr && Number(dr.amount) !== Number(cr.amount)) {
              groupHasViolation = true;
              evaluatedViolations.push({
                groupKey,
                reason: `Value mismatch between Debit and Credit in ${groupKey}`
              });
            }
          }
        });
      }

      if (!groupHasViolation) {
        passedGroups.push(groupKey);
      }
    });

    // Verify J-01 passed
    expect(passedGroups).toEqual(['journal_id=J-01']);

    // Verify J-02, J-03, J-04 all generated violations
    const violatingKeys = evaluatedViolations.map(v => v.groupKey);
    expect(violatingKeys).toContain('journal_id=J-02');
    expect(violatingKeys).toContain('journal_id=J-03');
    expect(violatingKeys).toContain('journal_id=J-04');

    expect(evaluatedViolations.find(v => v.groupKey === 'journal_id=J-02')?.reason).toContain('requires == 2 legs, but found 3');
    expect(evaluatedViolations.find(v => v.groupKey === 'journal_id=J-03')?.reason).toContain('Value mismatch');
    expect(evaluatedViolations.find(v => v.groupKey === 'journal_id=J-04')?.reason).toContain('Unclassified Group');

    // Clean up
    await repo.deleteColumnConfiguration(groupingWithTypesConfig.id);
  });
});



