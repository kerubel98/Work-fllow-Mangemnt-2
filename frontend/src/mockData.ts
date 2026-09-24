/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { User, HashtagPreset, Plugin, DatabaseConnection, Transaction, Issue, EnvironmentSystem, Team, TeamTask, TeamInsight, TeamDiscussionMessage, AppNotification, DirectMessage } from './types';

export const INITIAL_USERS: User[] = [
  {
    id: 'usr-1',
    username: 'admin',
    email: 'admin@paymentops.com',
    role: 'user',
    isApproved: true,
    createdAt: '2026-05-01T08:00:00Z',
  },
  {
    id: 'usr-2',
    username: 'kirubel_ops',
    email: 'kirubel@paymentops.com',
    role: 'user',
    isApproved: true,
    createdAt: '2026-05-15T09:30:00Z',
  },
  {
    id: 'usr-3',
    username: 'tech_sarah',
    email: 'sarah.tech@paymentops.com',
    role: 'user',
    isApproved: true,
    createdAt: '2026-05-18T14:15:00Z',
  },
  {
    id: 'usr-4',
    username: 'manager_alex',
    email: 'alex.manager@paymentops.com',
    role: 'user',
    isApproved: true,
    createdAt: '2026-06-01T10:00:00Z',
  },
  {
    id: 'usr-5',
    username: 'david_ops',
    email: 'david.ops@paymentops.com',
    role: 'user',
    isApproved: false, // Pending approval
    createdAt: '2026-07-10T11:45:00Z',
  },
  {
    id: 'usr-6',
    username: 'samuel_tech',
    email: 'samuel.tech@paymentops.com',
    role: 'user',
    isApproved: false, // Pending approval
    createdAt: '2026-07-11T05:20:00Z',
  }
];

export const INITIAL_HASHTAGS: HashtagPreset[] = [
  {
    tag: '#DUPLICATE_AUTH',
    description: 'Resolves duplicate auth charges occurring within a 5-minute window for the same card and amount.',
    criteria: 'Amount match, Card number match, Transaction time window < 300 seconds, Response code 00 (Success)',
    expectedFileStructure: ['Transaction_ID', 'Card_Number', 'Amount_USD', 'Auth_Time'],
    fileTemplateData: [
      { 'Transaction_ID': 'TXN-9021', 'Card_Number': '4111********9982', 'Amount_USD': '149.99', 'Auth_Time': '2026-07-11T04:12:00Z' },
      { 'Transaction_ID': 'TXN-9022', 'Card_Number': '4111********9982', 'Amount_USD': '149.99', 'Auth_Time': '2026-07-11T04:12:30Z' }
    ],
    criteriaRules: [
      { column: 'Transaction_ID', operator: 'is_required' },
      { column: 'Card_Number', operator: 'is_required' },
      { column: 'Amount_USD', operator: 'must_be_numeric' },
      { column: 'Amount_USD', operator: 'value_greater_than', value: '0' }
    ],
    solutionTemplate: `UPDATE transactions 
SET status = 'REVERSED', resolution_code = 'DUP_AUTH_CLEANUP' 
WHERE txn_id = '{{Transaction_ID}}' 
  AND card_num = '{{Card_Number}}' 
  AND amount = {{Amount_USD}} 
  AND id != (
    SELECT MIN(id) FROM transactions 
    WHERE card_num = '{{Card_Number}}' AND amount = {{Amount_USD}}
  );`,
    author: 'tech_sarah',
    createdAt: '2026-06-10T16:00:00Z',
  },
  {
    tag: '#STUCK_PENDING',
    description: 'Pushes stale transaction requests stuck in PENDING status to DECLINED or SETTLED.',
    criteria: 'Status = PENDING, Last updated > 24 hours ago, Merchant settle response timeout',
    expectedFileStructure: ['Transaction_ID', 'Terminal_ID', 'Stuck_Hours'],
    fileTemplateData: [
      { 'Transaction_ID': 'TXN-8840', 'Terminal_ID': 'TERM-08', 'Stuck_Hours': '26' }
    ],
    criteriaRules: [
      { column: 'Transaction_ID', operator: 'is_required' },
      { column: 'Terminal_ID', operator: 'is_required' },
      { column: 'Stuck_Hours', operator: 'must_be_numeric' }
    ],
    solutionTemplate: `UPDATE transactions 
SET status = 'DECLINED', response_code = '51', notes = 'Stale terminal pending flush' 
WHERE txn_id = '{{Transaction_ID}}' AND status = 'PENDING';`,
    author: 'tech_sarah',
    createdAt: '2026-06-12T11:00:00Z',
  },
  {
    tag: '#CARD_MISMATCH',
    description: 'Resolves issues where transactions failed authorization due to temporary gateway validation mismatches.',
    criteria: 'Response code 14, CVV status failed, User confirmed legitimate customer override',
    expectedFileStructure: ['Transaction_ID', 'Error_Detail', 'Auth_Token'],
    fileTemplateData: [
      { 'Transaction_ID': 'TXN-3011', 'Error_Detail': 'CVV check failed', 'Auth_Token': 'AUTH-7719' }
    ],
    criteriaRules: [
      { column: 'Transaction_ID', operator: 'is_required' },
      { column: 'Auth_Token', operator: 'is_required' }
    ],
    solutionTemplate: `UPDATE transaction_auths 
SET gate_override = TRUE, secondary_validated = TRUE 
WHERE internal_ref = '{{Transaction_ID}}';`,
    author: 'admin',
    createdAt: '2026-06-25T09:15:00Z',
  }
];

export const INITIAL_SYSTEMS: EnvironmentSystem[] = [
  {
    id: 'sys-1',
    name: 'Switch Front-End (FE) Network',
    description: 'Central switching company Front-End authorization switch (ISO 8583 message routing & terminal checkout).',
    testing: {
      dbName: 'switch_fe_testing',
      allowedTables: [],
      apiEndpoint: 'https://api.testing.internal.bank/v1/switch-fe'
    },
    production: {
      dbName: 'switch_fe_prod',
      allowedTables: [],
      apiEndpoint: 'https://api.internal.bank/v1/switch-fe'
    },
    allowedUserIds: ['usr-2', 'usr-3'], // kirubel_ops and tech_sarah
    allowedRoles: ['user'],
    requireDmlApproval: false
  },
  {
    id: 'sys-2',
    name: 'Switch Back-End (BE) Settlement',
    description: 'Central switching company Back-End clearing, ledger offsets, and settlement payouts.',
    testing: {
      dbName: 'switch_be_testing',
      allowedTables: [],
      apiEndpoint: 'https://api.testing.internal.bank/v1/switch-be'
    },
    production: {
      dbName: 'switch_be_prod',
      allowedTables: [],
      apiEndpoint: 'https://api.internal.bank/v1/switch-be'
    },
    allowedUserIds: ['usr-3'], // tech_sarah only (restricted production / admin can grant ops access)
    allowedRoles: ['user'],
    requireDmlApproval: true // DML/UPDATE statements on backend engine require check by Admin!
  },
  {
    id: 'sys-3',
    name: 'CBS (Core Banking System)',
    description: 'Banking environment Core Banking System (retail account balances, customer master, general ledger).',
    testing: {
      dbName: 'cbs_db_testing',
      allowedTables: [],
      apiEndpoint: 'https://api.testing.internal.bank/v1/cbs'
    },
    production: {
      dbName: 'cbs_db_prod',
      allowedTables: [],
      apiEndpoint: 'https://api.internal.bank/v1/cbs'
    },
    allowedUserIds: ['usr-1', 'usr-2', 'usr-3'],
    allowedRoles: ['user'],
    requireDmlApproval: true
  }
];

export const INITIAL_PLUGINS: Plugin[] = [
  {
    id: 'plg-1',
    name: 'Slack Alerts Integrator',
    description: 'Automatically dispatches an alert to #ops-alerts whenever high/critical priority issues are created.',
    enabled: true,
    category: 'notification',
    config: { webhookUrl: 'https://hooks.slack.com/services/T00/B00/X00' }
  },
  {
    id: 'plg-2',
    name: 'SQL Injection Guard',
    description: 'Pre-screens and validates SQL resolution scripts against restricted keywords (DROP, TRUNCATE, ALTER, GRANT) before permitting execution.',
    enabled: true,
    category: 'security'
  },
  {
    id: 'plg-3',
    name: 'Auto-Mapping AI Suggester',
    description: 'Scans uploaded file headers and suggests column mapping weights based on historical transaction datasets.',
    enabled: false,
    category: 'automation'
  },
  {
    id: 'plg-4',
    name: 'Unified Query Router',
    description: 'Routes queries across all connected operational databases in parallel using local caching.',
    enabled: true,
    category: 'database'
  }
];

export const INITIAL_DBS: DatabaseConnection[] = [];

export const TRANSACTION_ARCHIVE: Transaction[] = [];

export const INITIAL_ISSUES: Issue[] = [];

export const INITIAL_TEAMS: Team[] = [];

export const INITIAL_TEAM_TASKS: TeamTask[] = [];

export const INITIAL_TEAM_INSIGHTS: TeamInsight[] = [];

export const INITIAL_TEAM_MESSAGES: TeamDiscussionMessage[] = [];

export const INITIAL_DIRECT_MESSAGES: DirectMessage[] = [];

export const INITIAL_NOTIFICATIONS: AppNotification[] = [];



