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
      allowedTables: ['cur_trax', 'pos_bacth'],
      apiEndpoint: 'https://api.testing.internal.bank/v1/switch-fe'
    },
    production: {
      dbName: 'switch_fe_prod',
      allowedTables: ['cur_trax', 'pos_bacth'],
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
      allowedTables: ['auth_log_tab', 'sv_fin_tab', 'tran_log_tab'],
      apiEndpoint: 'https://api.testing.internal.bank/v1/switch-be'
    },
    production: {
      dbName: 'switch_be_prod',
      allowedTables: ['auth_log_tab', 'sv_fin_tab', 'tran_log_tab'],
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
      allowedTables: ['transactions_master', 'cur_trax', 'tran_log_tab'],
      apiEndpoint: 'https://api.testing.internal.bank/v1/cbs'
    },
    production: {
      dbName: 'cbs_db_prod',
      allowedTables: ['transactions_master', 'cur_trax', 'tran_log_tab'],
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

export const INITIAL_DBS: DatabaseConnection[] = [
  {
    id: 'db-1',
    name: 'CBS (Core Banking System)',
    type: 'PostgreSQL',
    host: 'cbs-pg-primary.prod.bank.internal',
    port: 5432,
    connectionString: 'postgresql://cbs_admin:BankingSecuredPass123!@cbs-pg-primary.prod.bank.internal:5432/cbs_master',
    databaseName: 'cbs_master',
    username: 'cbs_admin',
    status: 'online',
    apiEndpoint: 'https://api.internal.bank/v1/cbs-db',
    isExternal: true,
    systemCategory: 'CBS',
    environmentType: 'banking',
    description: 'External Core Banking System (CBS) storing retail accounts, customer ledgers, and master postings.',
    lastTestedAt: new Date().toISOString(),
    lastTestStatus: 'success',
    pingMs: 12,
    availableTables: ['transactions_master', 'cur_trax', 'auth_log_tab', 'pos_bacth', 'tran_log_tab', 'customers', 'merchants'],
    allowedTables: ['transactions_master', 'cur_trax', 'auth_log_tab', 'pos_bacth']
  },
  {
    id: 'db-2',
    name: 'Switch FE (Front-End Auth Switch)',
    type: 'Oracle',
    host: 'switch-fe-rac.internal.payments',
    port: 1521,
    connectionString: 'oracle://fe_auth:SwitchAuth2026@switch-fe-rac.internal.payments:1521/FE_SWITCH',
    databaseName: 'FE_SWITCH',
    username: 'fe_auth',
    status: 'online',
    apiEndpoint: 'https://api.internal.bank/v1/switch-fe-db',
    isExternal: true,
    systemCategory: 'Switch_FE',
    environmentType: 'switching',
    description: 'Central Switching Company Front-End authorization switch (real-time card & ISO 8583 validation).',
    lastTestedAt: new Date().toISOString(),
    lastTestStatus: 'success',
    pingMs: 18,
    availableTables: ['cur_trax', 'transactions_master', 'auth_log_tab', 'terminal_configs', 'iso_traces'],
    allowedTables: ['cur_trax', 'transactions_master', 'auth_log_tab']
  },
  {
    id: 'db-3',
    name: 'Switch BE (Back-End Settlement)',
    type: 'PostgreSQL',
    host: 'switch-be-settle.prod.internal',
    port: 5432,
    connectionString: 'postgresql://be_settle:ClearingPass88@switch-be-settle.prod.internal:5432/switch_be_settlement',
    databaseName: 'switch_be_settlement',
    username: 'be_settle',
    status: 'online',
    apiEndpoint: 'https://api.internal.bank/v1/switch-be-db',
    isExternal: true,
    systemCategory: 'Switch_BE',
    environmentType: 'switching',
    description: 'Central Switching Company Back-End engine for inter-bank clearing, batch settlement, and fee ledger.',
    lastTestedAt: new Date().toISOString(),
    lastTestStatus: 'success',
    pingMs: 15,
    availableTables: ['sv_fin_tab', 'auth_log_tab', 'settlement_batches', 'fee_ledgers', 'daily_reconciliation'],
    allowedTables: ['sv_fin_tab', 'auth_log_tab']
  },
  {
    id: 'db-4',
    name: 'E-Commerce Gateway DB',
    type: 'MySQL',
    host: 'gw-mysql-replica.prod.internal',
    port: 3306,
    connectionString: 'mysql://gw_user:GatewayPass2026@gw-mysql-replica.prod.internal:3306/gateway_transactions',
    databaseName: 'gateway_transactions',
    username: 'gw_user',
    status: 'online',
    apiEndpoint: 'https://api.internal.bank/v1/gateway-db',
    isExternal: true,
    systemCategory: 'Gateway',
    environmentType: 'general',
    description: 'External payment gateway replica capturing web checkout sessions and merchant dispute states.',
    lastTestedAt: new Date().toISOString(),
    lastTestStatus: 'success',
    pingMs: 22,
    availableTables: ['transactions_master', 'orders', 'charges', 'refunds', 'customers', 'webhook_logs'],
    allowedTables: ['transactions_master', 'orders', 'charges', 'refunds']
  },
  {
    id: 'db-5',
    name: 'Legacy Ledger Warehouse',
    type: 'Oracle',
    host: 'ledger-dw-cold.internal',
    port: 1521,
    connectionString: 'oracle://archive_reader:ReadOnlyPass@ledger-dw-cold.internal:1521/COLD_ARCHIVE',
    databaseName: 'COLD_ARCHIVE',
    username: 'archive_reader',
    status: 'offline',
    apiEndpoint: 'https://api.internal.bank/v1/ledger-db',
    isExternal: true,
    systemCategory: 'Ledger',
    environmentType: 'banking',
    description: 'Cold storage archive of historic GL postings and audited annual settlement summaries.',
    lastTestedAt: new Date().toISOString(),
    lastTestStatus: 'failed',
    lastTestMessage: 'Connection refused at ledger-dw-cold.internal:1521 (Host unreachable)',
    pingMs: 0,
    availableTables: ['historical_gl_entries', 'archived_settlements', 'legacy_trans_dump'],
    allowedTables: ['historical_gl_entries', 'archived_settlements']
  }
];

export const TRANSACTION_ARCHIVE: Transaction[] = [
  {
    id: 'TXN-9021',
    timestamp: '2026-07-11T04:12:00Z',
    cardNumber: '4111********9982',
    amount: 149.99,
    currency: 'USD',
    merchant: 'AMAZON.COM*OPERATIONS',
    status: 'PENDING',
    responseCode: '00',
    dbOrigin: 'E-Commerce Gateway DB'
  },
  {
    id: 'TXN-9022',
    timestamp: '2026-07-11T04:12:30Z',
    cardNumber: '4111********9982', // Same card, amount, merchant
    amount: 149.99,
    currency: 'USD',
    merchant: 'AMAZON.COM*OPERATIONS',
    status: 'PENDING',
    responseCode: '00',
    dbOrigin: 'E-Commerce Gateway DB'
  },
  {
    id: 'TXN-8840',
    timestamp: '2026-07-10T18:22:00Z',
    cardNumber: '5224********0014',
    amount: 1250.00,
    currency: 'USD',
    merchant: 'LUXURY WATCH DISTRIBUTORS',
    status: 'PENDING',
    responseCode: '00',
    dbOrigin: 'Core Retail Banking DB'
  },
  {
    id: 'TXN-7151',
    timestamp: '2026-07-10T09:40:00Z',
    cardNumber: '3402********1140',
    amount: 45.00,
    currency: 'USD',
    merchant: 'STARBUCKS COFFEE #401',
    status: 'SETTLED',
    responseCode: '00',
    dbOrigin: 'Card Authorization Network'
  },
  {
    id: 'TXN-3011',
    timestamp: '2026-07-09T23:55:00Z',
    cardNumber: '4509********4421',
    amount: 600.00,
    currency: 'USD',
    merchant: 'BESTBUY ONLINE STORE',
    status: 'DECLINED',
    responseCode: '51', // Insufficient funds
    dbOrigin: 'E-Commerce Gateway DB'
  },
  {
    id: 'TXN-1014',
    timestamp: '2026-07-09T14:10:00Z',
    cardNumber: '4912********0912',
    amount: 88.50,
    currency: 'USD',
    merchant: 'SHELL OIL STATION #99',
    status: 'REVERSED',
    responseCode: '00',
    dbOrigin: 'Core Retail Banking DB'
  }
];

export const INITIAL_ISSUES: Issue[] = [
  {
    id: 'ISS-101',
    title: 'Duplicate auth charges on Amazon cardholders',
    description: 'A batch of double authorizations was registered for cardholder Visa 9982 on Amazon within 30 seconds. First is legitimate, second is a duplicate auth holding customer funds.',
    status: 'Investigating',
    priority: 'Critical',
    creatorId: 'usr-2',
    creatorName: 'kirubel_ops',
    createdAt: '2026-07-11T05:10:00Z',
    type: 'file',
    uploadedFileName: 'amazon_auths_err_batch.csv',
    uploadedFileHeaders: ['Transaction_ID', 'Card_Number', 'Amount_USD', 'Auth_Time'],
    fileMapping: {
      'Transaction_ID': 'transaction_id',
      'Card_Number': 'card_number',
      'Amount_USD': 'amount',
      'Auth_Time': 'timestamp'
    },
    linkedHashtag: '#DUPLICATE_AUTH',
    firstLevelNotes: 'Mapped uploaded batch columns. Extracted 2 matching entries. Identified that TXN-9022 is the secondary duplicate entry holding $149.99 in customer credit ledger.',
    firstLevelMappedData: [
      { Transaction_ID: 'TXN-9021', Card_Number: '4111********9982', Amount_USD: '149.99', Auth_Time: '2026-07-11T04:12:00Z' },
      { Transaction_ID: 'TXN-9022', Card_Number: '4111********9982', Amount_USD: '149.99', Auth_Time: '2026-07-11T04:12:30Z' }
    ],
    chat: [
      {
        id: 'msg-1',
        senderId: 'usr-2',
        senderName: 'kirubel_ops',
        senderRole: 'user',
        text: 'Hello tech team, I uploaded the Amazon errors batch. The system auto-matched column variables to the #DUPLICATE_AUTH preset. Can you review?',
        timestamp: '2026-07-11T05:12:00Z'
      },
      {
        id: 'msg-2',
        senderId: 'usr-3',
        senderName: 'tech_sarah',
        senderRole: 'user',
        text: 'Thanks Kirubel. I am looking into this duplicate auth. Mapped data confirms the card matches and transaction window is indeed under 30 seconds. I will prepare the clean-up SQL query.',
        timestamp: '2026-07-11T05:15:00Z'
      }
    ]
  },
  {
    id: 'ISS-102',
    title: 'Luxury Watch transaction over-limit stuck',
    description: 'Transaction TXN-8840 of $1250.00 shows pending state on merchant site, but user received alert of withdrawal. Need immediate first-level investigation or pending status forced decline.',
    status: 'Open',
    priority: 'High',
    creatorId: 'usr-2',
    creatorName: 'kirubel_ops',
    createdAt: '2026-07-11T06:05:00Z',
    type: 'single',
    transactionId: 'TXN-8840',
    linkedHashtag: '#STUCK_PENDING',
    chat: []
  },
  {
    id: 'ISS-100',
    title: 'Customer gas purchase reversal mismatch',
    description: 'Transaction TXN-1014 at Shell was reversed due to hardware fault, but reversal did not sync to ledger. Operational staff reported error in balance.',
    status: 'Resolved',
    priority: 'Medium',
    creatorId: 'usr-2',
    creatorName: 'kirubel_ops',
    createdAt: '2026-07-10T11:00:00Z',
    type: 'single',
    transactionId: 'TXN-1014',
    firstLevelNotes: 'Loaded single transaction details. Transaction shows reversed state in E-commerce gateway but is active in ledger DB.',
    secondLevelNotes: 'Prepared ledger reconciliation script.',
    solutionScript: `UPDATE ledger_entries SET balance_impact = 0, state = 'REVERSED' WHERE source_ref = 'TXN-1014';`,
    solutionTestResult: 'Dry-run successful. Affected Rows: 1. Ledger state matched Gateway.',
    solutionExecuted: true,
    solutionExecutedAt: '2026-07-10T14:30:00Z',
    chat: [
      {
        id: 'msg-3',
        senderId: 'usr-2',
        senderName: 'kirubel_ops',
        senderRole: 'user',
        text: 'This is a single txn reversal error. Mismatch between Core DB ledger and the Shell device API logs.',
        timestamp: '2026-07-10T11:02:00Z'
      },
      {
        id: 'msg-4',
        senderId: 'usr-3',
        senderName: 'tech_sarah',
        senderRole: 'user',
        text: 'I ran a query on core DB shell entries. Found ledger entry state was left pending. Running manual reconciliation script to override.',
        timestamp: '2026-07-10T14:25:00Z'
      }
    ]
  }
];

export const INITIAL_TEAMS: Team[] = [];

export const INITIAL_TEAM_TASKS: TeamTask[] = [
  {
    id: 'ttask-1',
    teamId: 'team-1',
    title: 'Audit Payment Gateway #4021 Discrepancies',
    description: 'Verify status mismatch between Shell API logs and Core DB ledger before running SQL patch.',
    assigneeId: 'usr-2',
    assigneeName: 'kirubel_ops',
    creatorId: 'usr-4',
    creatorName: 'manager_alex',
    status: 'In Progress',
    priority: 'High',
    createdAt: '2026-07-22T09:30:00Z',
    startDate: '2026-07-22',
    dueDate: '2026-07-26',
    milestone: 'Phase 1 - Reconciliation'
  },
  {
    id: 'ttask-2',
    teamId: 'team-1',
    title: 'Prepare Weekly Reconciliation SLA Summary',
    description: 'Export CSV metrics from Managerial Dashboard and share with executive team.',
    assigneeId: 'usr-5',
    assigneeName: 'sam_ops',
    creatorId: 'usr-4',
    creatorName: 'manager_alex',
    status: 'To Do',
    priority: 'Medium',
    createdAt: '2026-07-23T14:15:00Z',
    startDate: '2026-07-24',
    dueDate: '2026-07-28',
    milestone: 'Phase 2 - Reporting'
  },
  {
    id: 'ttask-3',
    teamId: 'team-1',
    title: 'Review Dry-Run SQL script for Issue #ISS-102',
    description: 'Coordinate with technical team lead to confirm safety before execution on prod DB.',
    assigneeId: 'usr-4',
    assigneeName: 'manager_alex',
    creatorId: 'usr-2',
    creatorName: 'kirubel_ops',
    status: 'Done',
    priority: 'High',
    createdAt: '2026-07-20T11:00:00Z',
    startDate: '2026-07-20',
    dueDate: '2026-07-21',
    milestone: 'Phase 1 - Reconciliation'
  }
];

export const INITIAL_TEAM_INSIGHTS: TeamInsight[] = [
  {
    id: 'tins-1',
    teamId: 'team-1',
    title: 'Always Dry-Run UPDATE queries before execution',
    content: 'When addressing ledger mismatch errors, make sure to execute SELECT COUNT(*) first to ensure exact row targeting. Never run unconstrained UPDATE statements in prod.',
    authorId: 'usr-4',
    authorName: 'manager_alex',
    authorRole: 'user',
    tags: ['BestPractices', 'SQLSafety', 'Reconciliation'],
    createdAt: '2026-07-15T08:00:00Z'
  },
  {
    id: 'tins-2',
    teamId: 'team-1',
    title: 'Shell Gateway Timeout Pattern Identified',
    content: 'Transactions occurring between 02:00 AM - 02:15 AM UTC experience micro-latency delays due to batch backups. Tag these cases with #GatewayTimeout for fast grouping.',
    authorId: 'usr-2',
    authorName: 'kirubel_ops',
    authorRole: 'user',
    tags: ['GatewayTimeout', 'OpsTip'],
    createdAt: '2026-07-18T16:20:00Z'
  }
];

export const INITIAL_TEAM_MESSAGES: TeamDiscussionMessage[] = [
  {
    id: 'tmsg-1',
    teamId: 'team-1',
    senderId: 'usr-4',
    senderName: 'manager_alex',
    senderRole: 'user',
    content: 'Welcome to the Payment Ops Alpha team workspace! Let us use this channel to sync on pending discrepancy cases and coordinate dry-run approvals.',
    timestamp: '2026-07-20T09:00:00Z'
  },
  {
    id: 'tmsg-2',
    teamId: 'team-1',
    senderId: 'usr-2',
    senderName: 'kirubel_ops',
    senderRole: 'user',
    content: 'Thanks Alex! I just submitted case #ISS-103 regarding transaction reversal mismatch in DB-001. Please review when free.',
    timestamp: '2026-07-20T10:15:00Z'
  }
];

export const INITIAL_DIRECT_MESSAGES: DirectMessage[] = [
  {
    id: 'dm-1',
    senderId: 'usr-1', // admin
    senderName: 'admin',
    senderRole: 'user',
    receiverId: 'usr-2', // kirubel_ops
    receiverName: 'kirubel_ops',
    content: 'Hi Kirubel, welcome to the operational portal! Let me know if you need elevated database permissions.',
    timestamp: '2026-07-24T10:15:00Z',
    isRead: true
  },
  {
    id: 'dm-2',
    senderId: 'usr-2', // kirubel_ops
    senderName: 'kirubel_ops',
    senderRole: 'user',
    receiverId: 'usr-1', // admin
    receiverName: 'admin',
    content: 'Thanks Alex! I submitted a SELECT query privilege request for DB-001.',
    timestamp: '2026-07-24T10:18:00Z',
    isRead: true
  },
  {
    id: 'dm-3',
    senderId: 'usr-3', // tech_sarah
    senderName: 'tech_sarah',
    senderRole: 'user',
    receiverId: 'usr-2', // kirubel_ops
    receiverName: 'kirubel_ops',
    content: 'Hey @kirubel_ops, do you have a moment to review the SQL dry-run parser results for settlement issue ISS-101?',
    timestamp: '2026-07-24T13:30:00Z',
    isRead: false
  }
];

export const INITIAL_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-1',
    userId: 'usr-2', // kirubel_ops
    type: 'team_added',
    title: 'Added to Permanent Unit Team',
    message: '@manager_alex added you as an active member to "Core Settlement Unit".',
    timestamp: '2026-07-24T12:00:00Z',
    isRead: false,
    linkTab: 'team_workspace',
    targetTeamId: 'team-1',
    targetSubTab: 'members',
    actorName: 'manager_alex'
  },
  {
    id: 'notif-2',
    userId: 'usr-2', // kirubel_ops
    type: 'task_assigned',
    title: 'New Task Assigned: Settlement Reconciliation',
    message: '@manager_alex assigned task "Daily Visa Batch Reconciliation" to you due on 2026-07-26.',
    timestamp: '2026-07-24T12:30:00Z',
    isRead: false,
    linkTab: 'team_workspace',
    targetTeamId: 'team-1',
    targetSubTab: 'tasks',
    targetTaskId: 'tt-1',
    actorName: 'manager_alex'
  },
  {
    id: 'notif-3',
    userId: 'usr-2', // kirubel_ops
    type: 'chat',
    title: 'Direct Message from @tech_sarah',
    message: '@tech_sarah: "Hey @kirubel_ops, do you have a moment to review the SQL dry-run parser results for settlement issue ISS-101?"',
    timestamp: '2026-07-24T13:30:00Z',
    isRead: false,
    linkTab: 'direct_chat',
    targetDirectUserId: 'usr-3',
    actorName: 'tech_sarah'
  },
  {
    id: 'notif-4',
    userId: 'usr-3', // tech_sarah
    type: 'task_assigned',
    title: 'New Task Assigned: Script Review',
    message: '@admin assigned task "Verify SQL Dry-Run Parser" to you.',
    timestamp: '2026-07-24T11:20:00Z',
    isRead: false,
    linkTab: 'team_workspace',
    targetTeamId: 'team-1',
    targetSubTab: 'tasks',
    targetTaskId: 'tt-2',
    actorName: 'admin'
  },
  {
    id: 'notif-5',
    userId: 'usr-1', // admin
    type: 'system',
    title: 'System Access Request',
    message: 'New user @david_ops requested account approval.',
    timestamp: '2026-07-24T10:00:00Z',
    isRead: false,
    linkTab: 'user_admin',
    actorName: 'david_ops'
  }
];


