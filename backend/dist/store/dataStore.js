export const INITIAL_USERS = [
    {
        id: 'usr-1',
        username: 'admin',
        email: 'admin@paymentops.com',
        role: 'admin',
        isApproved: true,
        createdAt: '2026-05-01T08:00:00Z',
        canExecuteSelect: true,
        canExecuteUpdate: true
    },
    {
        id: 'usr-2',
        username: 'kirubel_ops',
        email: 'kirubel@paymentops.com',
        role: 'operational',
        isApproved: true,
        createdAt: '2026-05-15T09:30:00Z',
        canExecuteSelect: true,
        canExecuteUpdate: false
    },
    {
        id: 'usr-3',
        username: 'tech_sarah',
        email: 'sarah.tech@paymentops.com',
        role: 'technical',
        isApproved: true,
        createdAt: '2026-05-18T14:15:00Z',
        canExecuteSelect: true,
        canExecuteUpdate: true
    },
    {
        id: 'usr-4',
        username: 'manager_alex',
        email: 'alex.manager@paymentops.com',
        role: 'managerial',
        isApproved: true,
        createdAt: '2026-06-01T10:00:00Z',
        canExecuteSelect: true,
        canExecuteUpdate: false
    },
    {
        id: 'usr-5',
        username: 'david_ops',
        email: 'david.ops@paymentops.com',
        role: 'operational',
        isApproved: false,
        createdAt: '2026-07-10T11:45:00Z'
    },
    {
        id: 'usr-6',
        username: 'samuel_tech',
        email: 'samuel.tech@paymentops.com',
        role: 'technical',
        isApproved: false,
        createdAt: '2026-07-11T05:20:00Z'
    }
];
export const INITIAL_HASHTAGS = [
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
        solutionTemplate: `UPDATE transactions SET status = 'REVERSED', resolution_code = 'DUP_AUTH_CLEANUP' WHERE txn_id = '{{Transaction_ID}}';`,
        author: 'tech_sarah',
        createdAt: '2026-06-10T16:00:00Z'
    },
    {
        tag: '#STUCK_PENDING',
        description: 'Pushes stale transaction requests stuck in PENDING status to DECLINED or SETTLED.',
        criteria: 'Status = PENDING, Last updated > 24 hours ago',
        expectedFileStructure: ['Transaction_ID', 'Terminal_ID', 'Stuck_Hours'],
        solutionTemplate: `UPDATE transactions SET status = 'DECLINED', response_code = 'TIMEOUT_99' WHERE txn_id = '{{Transaction_ID}}';`,
        author: 'admin',
        createdAt: '2026-06-12T11:20:00Z'
    }
];
export const INITIAL_PLUGINS = [
    {
        id: 'plg-1',
        name: 'Slack Notification Dispatcher',
        description: 'Posts automated alerts to #ops-discrepancies channel when high severity issues are created.',
        enabled: true,
        category: 'notification',
        config: { webhookUrl: 'https://hooks.slack.com/services/T00/B00/X00' }
    },
    {
        id: 'plg-2',
        name: 'Dual-Control SQL Approver',
        description: 'Requires secondary admin authorization for UPDATE/DELETE scripts against production tables.',
        enabled: true,
        category: 'security'
    }
];
export const INITIAL_DBS = [
    {
        id: 'db-3',
        name: 'MongoDB Operational Workflow Cluster',
        type: 'MongoDB',
        host: '127.0.0.1',
        port: 27017,
        connectionString: 'mongodb://127.0.0.1:27017/operational_workflow_db',
        databaseName: 'operational_workflow_db',
        status: 'online',
        apiEndpoint: '/api/db/mongo/status',
        createdByAdmin: true,
        requiresAccessApproval: false,
        description: 'MongoDB primary operational database cluster hosting collections for users, issues, transaction templates, working databases, and audit logs.',
        systemCategory: 'Custom_External',
        environmentType: 'general',
        lastTestedAt: new Date().toISOString(),
        lastTestStatus: 'success',
        pingMs: 4,
        availableTables: [],
        allowedTables: []
    }
];
export const INITIAL_ISSUES = [
    {
        id: 'ISSUE-1001',
        title: 'Duplicate Auth Charge Surge - Terminal 8812',
        description: 'Operational team identified 42 duplicate authorizations created during batch gateway sync.',
        status: 'Investigating',
        priority: 'High',
        creatorId: 'usr-2',
        creatorName: 'kirubel_ops',
        createdAt: '2026-07-24T14:30:00Z',
        type: 'single',
        transactionId: 'TXN-9021',
        linkedHashtag: '#DUPLICATE_AUTH',
        assignedTechUserId: 'usr-3',
        assignedTechUserName: 'tech_sarah',
        chat: [
            {
                id: 'msg-1',
                senderId: 'usr-2',
                senderName: 'kirubel_ops',
                senderRole: 'operational',
                text: 'Assigned to technical team for SQL script verification.',
                timestamp: '2026-07-24T14:32:00Z'
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
        firstLevelNotes: 'Identified stuck transaction TXN-8840 for $1250.00 at LUXURY WATCH DISTRIBUTORS in PENDING status in Core Retail Banking DB.',
        firstLevelMappedData: [
            {
                Transaction_ID: 'TXN-8840',
                Card_Number: '5224********0014',
                Amount_USD: '1250.00',
                Currency: 'USD',
                Merchant: 'LUXURY WATCH DISTRIBUTORS',
                Status: 'PENDING',
                Auth_Time: '2026-07-10T18:22:00Z',
                DB_Origin: 'Core Retail Banking DB'
            }
        ],
        chat: []
    }
];
export const INITIAL_SYSTEMS = [
    {
        id: 'sys-1',
        name: 'Payment Processing Engine',
        description: 'Core authorization and settlement gateway system.',
        allowedUserIds: ['usr-1', 'usr-2', 'usr-3', 'usr-4'],
        allowedRoles: ['admin', 'operational', 'technical', 'managerial'],
        requireDmlApproval: true,
        testing: {
            dbName: 'payment_engine_test',
            allowedTables: ['transactions_test', 'auth_logs_test', 'merchants_test'],
            apiEndpoint: 'https://api.paymentops.internal/sys1/test'
        },
        production: {
            dbName: 'payment_engine_prod',
            allowedTables: ['transactions', 'auth_logs', 'merchants'],
            apiEndpoint: 'https://api.paymentops.internal/sys1/prod'
        }
    }
];
export const INITIAL_TEAMS = [
    {
        id: 'team-parent-ops',
        name: 'Core Operations & Settlement Division',
        description: 'Parent corporate division managing international clearing, settlement ledgers, and institutional reconciliation.',
        teamType: 'permanent',
        managerId: 'usr-4',
        managerName: 'manager_alex',
        memberIds: ['usr-1', 'usr-3', 'usr-4'],
        createdAt: '2026-04-15T08:00:00Z'
    },
    {
        id: 'team-1',
        name: 'Core Payments Reconciliation Squad',
        description: 'Specialized unit resolving high-volume transaction authorization discrepancies.',
        teamType: 'permanent',
        managerId: 'usr-4',
        managerName: 'manager_alex',
        memberIds: ['usr-2', 'usr-3', 'usr-4'],
        createdAt: '2026-05-01T10:00:00Z'
    },
    {
        id: 'team-cards',
        name: 'Card Disputes & Chargebacks Unit',
        description: 'Dedicated team investigating cardholder disputes, chargebacks, and gateway settlement variances.',
        teamType: 'permanent',
        managerId: 'usr-4',
        managerName: 'manager_alex',
        memberIds: ['usr-2', 'usr-4'],
        createdAt: '2026-05-10T10:00:00Z'
    },
    {
        id: 'team-audit',
        name: 'Regulatory Audit & Compliance Squad',
        description: 'Oversight unit ensuring financial settlement logs adhere to banking compliance and double-entry rules.',
        teamType: 'permanent',
        managerId: 'usr-4',
        managerName: 'manager_alex',
        memberIds: ['usr-3', 'usr-4'],
        createdAt: '2026-05-12T10:00:00Z'
    },
    {
        id: 'team-clearing-working',
        name: 'Cross-Border Clearing Project Squad',
        description: 'Working squad implementing ISO20022 automated feed ingestion and multi-currency netting.',
        teamType: 'working',
        managerId: 'usr-2',
        managerName: 'kirubel_ops',
        memberIds: ['usr-2', 'usr-5'],
        createdAt: '2026-06-01T10:00:00Z'
    },
    {
        id: 'team-fraud-working',
        name: 'High-Frequency Fraud Triage Squad',
        description: 'Operational task force monitoring anomalous transaction velocity and duplicate batch postings.',
        teamType: 'working',
        managerId: 'usr-3',
        managerName: 'tech_sarah',
        memberIds: ['usr-3', 'usr-6'],
        createdAt: '2026-06-15T10:00:00Z'
    }
];
export const INITIAL_TEAM_RELATIONSHIPS = [
    {
        id: 'rel-seed-1',
        sourceTeamId: 'team-1',
        targetTeamId: 'team-parent-ops',
        relationshipType: 'PARENT_UNIT',
        description: 'Subordinate reconciliation squad reporting to Core Operations Division.',
        createdBy: 'system',
        createdAt: '2026-05-01T10:00:00Z'
    },
    {
        id: 'rel-seed-2',
        sourceTeamId: 'team-cards',
        targetTeamId: 'team-parent-ops',
        relationshipType: 'PARENT_UNIT',
        description: 'Card disputes unit reporting to Core Operations Division.',
        createdBy: 'system',
        createdAt: '2026-05-10T10:00:00Z'
    },
    {
        id: 'rel-seed-3',
        sourceTeamId: 'team-cards',
        targetTeamId: 'team-1',
        relationshipType: 'ESCALATION_TARGET',
        description: 'Unresolved gateway discrepancies escalated to Core Payments Squad for SQL rollback review.',
        createdBy: 'system',
        createdAt: '2026-05-15T10:00:00Z'
    },
    {
        id: 'rel-seed-4',
        sourceTeamId: 'team-audit',
        targetTeamId: 'team-1',
        relationshipType: 'AUDIT_COMPLIANCE_REVIEWER',
        description: 'Continuous oversight and sample auditing of dual-control maker-checker overrides.',
        createdBy: 'system',
        createdAt: '2026-05-20T10:00:00Z'
    },
    {
        id: 'rel-seed-5',
        sourceTeamId: 'team-clearing-working',
        targetTeamId: 'team-1',
        relationshipType: 'UPSTREAM_PROVIDER',
        description: 'Clearing squad produces validated currency batches consumed by Core Payments for reconciliation.',
        createdBy: 'system',
        createdAt: '2026-06-01T10:00:00Z'
    },
    {
        id: 'rel-seed-6',
        sourceTeamId: 'team-fraud-working',
        targetTeamId: 'team-cards',
        relationshipType: 'PEER_COLLABORATOR',
        description: 'Lateral collaboration for card fraud investigations and duplicate reversal proposals.',
        createdBy: 'system',
        createdAt: '2026-06-15T10:00:00Z'
    }
];
export const INITIAL_ORGANIZATIONS = [
    {
        id: 'org-1',
        name: 'Global Payment Operations',
        slug: 'global-payment-ops',
        description: 'Central operational hub managing cross-border clearing, card auth verification, and high-frequency settlement reconciliation.',
        blogPostContent: `# Welcome to Global Payment Operations Hub

Global Payment Operations serves as the primary backbone for processing card authorizations and multi-bank settlement workflows across international clearing networks.

### Core Objectives & Operating Standards
1. **Zero Unreconciled Discrepancies**: All duplicate authorizations must be flagged within 5 minutes of batch processing.
2. **Dual-Control Approval Safeguards**: Any direct DML (UPDATE/DELETE) execution against production database nodes requires administrator verification.
3. **24/7 SLA Monitoring**: Operational teams maintain direct hotline access with technical engineers for rapid SQL patch deployment.

### Key SOP Guidelines
- Always verify transaction hashes in **Staging/Testing** before running production scripts.
- Use hashtag presets like **#DUPLICATE_AUTH** or **#STUCK_PENDING** for automatic file column mapping.
- Maintain transparent team logs in the **Team Discussion Workspace** for complete audit trails.`,
        category: 'Payment Infrastructure',
        logoUrl: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=300&q=80',
        ownerId: 'usr-1',
        ownerName: 'admin',
        memberIds: ['usr-1', 'usr-2', 'usr-3', 'usr-4'],
        associatedTeamIds: ['team-1'],
        associatedDbIds: ['db-1', 'db-2'],
        createdAt: '2026-05-01T08:00:00Z'
    },
    {
        id: 'org-2',
        name: 'Alpha Merchant Clearing',
        slug: 'alpha-merchant-clearing',
        description: 'Specialized unit handling merchant dispute settlements, POS batch transfers, and e-commerce gateway reconciliation.',
        blogPostContent: `# Alpha Merchant Clearing Division

Alpha Merchant Clearing oversees merchant gateway integrations, real-time POS batch settlements, and e-commerce chargeback resolution.

### Operations Overview
Our team processes over 1.2M daily merchant transactions across 8 regional payment gateways. We focus on:
- Minimizing merchant settlement latency down to under 2 hours.
- Automated error tagging for failed CVV overrides and card mismatch exceptions.
- Real-time notification dispatch via Slack and internal webhooks.

### Merchant Onboarding & Support
For merchant inquiries or custom database permissions, submit an Access Request through the Database Query Tool.`,
        category: 'Merchant Services',
        logoUrl: 'https://images.unsplash.com/photo-1556742049-0a670f4a4591?auto=format&fit=crop&w=300&q=80',
        ownerId: 'usr-4',
        ownerName: 'manager_alex',
        memberIds: ['usr-4', 'usr-2'],
        associatedTeamIds: ['team-2'],
        associatedDbIds: ['db-3'],
        createdAt: '2026-06-01T10:00:00Z'
    },
    {
        id: 'org-3',
        name: 'Risk & Fraud Division',
        slug: 'risk-and-fraud-division',
        description: 'Dedicated security unit managing SQL patch safety, automated threat filters, and high-severity issue overrides.',
        blogPostContent: `# Risk & Fraud Security Division

The Risk & Fraud Division guards platform infrastructure against malicious SQL injection, unauthorized database modifications, and abnormal transaction surges.

### Defense Pillars
- **SQL Injection Guard**: Automated keyword scanning blocks unsafe DDL/DML statements.
- **Audit Logging**: Every executed query across PostgreSQL, Oracle, and MySQL is captured in the Connection Usage Log.
- **Role-Based Privilege Escalation**: Strict separation of operational and technical privileges.`,
        category: 'Risk & Security',
        logoUrl: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&w=300&q=80',
        ownerId: 'usr-3',
        ownerName: 'tech_sarah',
        memberIds: ['usr-3'],
        associatedTeamIds: [],
        associatedDbIds: ['db-1', 'db-2', 'db-3', 'db-4'],
        createdAt: '2026-06-15T09:00:00Z'
    }
];
export const INITIAL_GLOBAL_TRANSACTION_SCHEMA = {
    id: 'gtsc-1',
    version: '1.2.0',
    updatedAt: '2026-08-09T08:00:00Z',
    updatedBy: 'admin',
    systemStandardFields: [
        { key: 'transaction_id', label: 'Transaction ID', description: 'Primary Unique Transaction Reference', dataType: 'string', required: true, isSystemStandard: true },
        { key: 'card_number', label: 'Card / Token', description: 'Masked Payment Card PAN or Security Token', dataType: 'string', required: true, isSystemStandard: true },
        { key: 'amount_usd', label: 'Amount ($ USD)', description: 'Total Numeric Transaction Amount', dataType: 'number', required: true, isSystemStandard: true },
        { key: 'currency', label: 'Currency', description: '3-letter Currency Code (default: USD)', dataType: 'string', required: false, isSystemStandard: true },
        { key: 'customer_email', label: 'Customer Email', description: 'Buyer or Account Holder Email', dataType: 'string', required: false, isSystemStandard: true },
        { key: 'merchant_id', label: 'Merchant ID', description: 'Merchant Account or Terminal Identifier', dataType: 'string', required: false, isSystemStandard: true },
        { key: 'auth_time', label: 'Authorization Time', description: 'Transaction Authorization ISO Timestamp', dataType: 'date', required: true, isSystemStandard: true },
        { key: 'status', label: 'Transaction Status', description: 'Current State (e.g. AUTHORIZED, SETTLED, DECLINED, CHARGEBACK, REVERSED)', dataType: 'string', required: true, isSystemStandard: true },
        { key: 'response_code', label: 'Response Code', description: 'Gateway or Network Response Code (e.g. 00, 51, 91)', dataType: 'string', required: false, isSystemStandard: true },
        { key: 'category', label: 'Category / Reason Code', description: 'Dispute or Clearing Category', dataType: 'string', required: false, isSystemStandard: true }
    ],
    customFields: [
        { key: 'dispute_reason', label: 'Dispute Reason', description: 'Custom operational dispute note or chargeback code', dataType: 'string', required: false },
        { key: 'batch_seq_num', label: 'Batch Sequence Number', description: 'Clearing file sequence batch number', dataType: 'string', required: false }
    ],
    defaultTemplateId: 'tpl-1'
};
export const INITIAL_TRANSACTION_TEMPLATES = [
    {
        id: 'tpl-1',
        name: 'Standard Payment Gateway CSV',
        description: 'Default column mapping for standard e-commerce and retail gateway exports.',
        sourceType: 'csv',
        isDefault: true,
        sampleHeaders: ['Transaction_ID', 'Card_Number', 'Amount_USD', 'Customer_Email', 'Merchant_ID', 'Auth_Time', 'Status', 'Response_Code', 'Category'],
        mappings: [
            { targetFieldKey: 'transaction_id', targetFieldLabel: 'Transaction ID', dataType: 'string', required: true, sourceHeader: 'Transaction_ID', transformationRule: 'trim' },
            { targetFieldKey: 'card_number', targetFieldLabel: 'Card Number', dataType: 'string', required: true, sourceHeader: 'Card_Number', transformationRule: 'mask_card' },
            { targetFieldKey: 'amount_usd', targetFieldLabel: 'Amount (USD)', dataType: 'number', required: true, sourceHeader: 'Amount_USD', transformationRule: 'parse_currency' },
            { targetFieldKey: 'currency', targetFieldLabel: 'Currency', dataType: 'string', required: true, sourceHeader: 'Currency', defaultValue: 'USD' },
            { targetFieldKey: 'customer_email', targetFieldLabel: 'Customer Email', dataType: 'string', required: true, sourceHeader: 'Customer_Email', transformationRule: 'trim' },
            { targetFieldKey: 'merchant_id', targetFieldLabel: 'Merchant ID', dataType: 'string', required: true, sourceHeader: 'Merchant_ID' },
            { targetFieldKey: 'auth_time', targetFieldLabel: 'Authorization Time', dataType: 'date', required: true, sourceHeader: 'Auth_Time' },
            { targetFieldKey: 'status', targetFieldLabel: 'Transaction Status', dataType: 'string', required: true, sourceHeader: 'Status', transformationRule: 'uppercase' },
            { targetFieldKey: 'response_code', targetFieldLabel: 'Response Code', dataType: 'string', required: false, sourceHeader: 'Response_Code', defaultValue: '00' },
            { targetFieldKey: 'category', targetFieldLabel: 'Category', dataType: 'string', required: false, sourceHeader: 'Category' }
        ],
        authorName: 'admin',
        globalKeyFieldSchemaId: 'gkf-1',
        createdAt: '2026-07-01T08:00:00Z',
        updatedAt: '2026-08-09T08:00:00Z'
    },
    {
        id: 'tpl-2',
        name: 'Stripe Dispute & Chargeback Export',
        description: 'Auto-maps Stripe dispute reporting exports into standard global transaction keys.',
        sourceType: 'csv',
        globalKeyFieldSchemaId: 'gkf-2',
        sampleHeaders: ['charge_id', 'card_fingerprint', 'charge_amount', 'buyer_email', 'merchant_account', 'created_date', 'dispute_status', 'reason_code'],
        mappings: [
            { targetFieldKey: 'transaction_id', targetFieldLabel: 'Transaction ID', dataType: 'string', required: true, sourceHeader: 'charge_id' },
            { targetFieldKey: 'card_number', targetFieldLabel: 'Card Number', dataType: 'string', required: true, sourceHeader: 'card_fingerprint' },
            { targetFieldKey: 'amount_usd', targetFieldLabel: 'Amount (USD)', dataType: 'number', required: true, sourceHeader: 'charge_amount', transformationRule: 'parse_currency' },
            { targetFieldKey: 'currency', targetFieldLabel: 'Currency', dataType: 'string', required: true, sourceHeader: 'currency', defaultValue: 'USD' },
            { targetFieldKey: 'customer_email', targetFieldLabel: 'Customer Email', dataType: 'string', required: true, sourceHeader: 'buyer_email' },
            { targetFieldKey: 'merchant_id', targetFieldLabel: 'Merchant ID', dataType: 'string', required: true, sourceHeader: 'merchant_account' },
            { targetFieldKey: 'auth_time', targetFieldLabel: 'Authorization Time', dataType: 'date', required: true, sourceHeader: 'created_date' },
            { targetFieldKey: 'status', targetFieldLabel: 'Transaction Status', dataType: 'string', required: true, sourceHeader: 'dispute_status', transformationRule: 'uppercase' },
            { targetFieldKey: 'response_code', targetFieldLabel: 'Response Code', dataType: 'string', required: false, sourceHeader: 'response_code', defaultValue: '05' },
            { targetFieldKey: 'category', targetFieldLabel: 'Category', dataType: 'string', required: false, sourceHeader: 'reason_code' }
        ],
        authorName: 'tech_sarah',
        createdAt: '2026-07-15T10:30:00Z',
        updatedAt: '2026-08-01T12:00:00Z'
    },
    {
        id: 'tpl-3',
        name: 'Visa ISO 8583 Settlement Clearing',
        description: 'Parses Visa inter-bank clearing reports and maps ISO fields to global transaction keys.',
        sourceType: 'csv',
        globalKeyFieldSchemaId: 'gkf-1',
        sampleHeaders: ['Ref_Number', 'PAN_Masked', 'Txn_Val_USD', 'Cardholder_Mail', 'Term_ID', 'Iso_Timestamp', 'Txn_State', 'Iso_Resp'],
        mappings: [
            { targetFieldKey: 'transaction_id', targetFieldLabel: 'Transaction ID', dataType: 'string', required: true, sourceHeader: 'Ref_Number' },
            { targetFieldKey: 'card_number', targetFieldLabel: 'Card Number', dataType: 'string', required: true, sourceHeader: 'PAN_Masked' },
            { targetFieldKey: 'amount_usd', targetFieldLabel: 'Amount (USD)', dataType: 'number', required: true, sourceHeader: 'Txn_Val_USD', transformationRule: 'parse_currency' },
            { targetFieldKey: 'currency', targetFieldLabel: 'Currency', dataType: 'string', required: true, sourceHeader: 'Val_Currency', defaultValue: 'USD' },
            { targetFieldKey: 'customer_email', targetFieldLabel: 'Customer Email', dataType: 'string', required: true, sourceHeader: 'Cardholder_Mail' },
            { targetFieldKey: 'merchant_id', targetFieldLabel: 'Merchant ID', dataType: 'string', required: true, sourceHeader: 'Term_ID' },
            { targetFieldKey: 'auth_time', targetFieldLabel: 'Authorization Time', dataType: 'date', required: true, sourceHeader: 'Iso_Timestamp' },
            { targetFieldKey: 'status', targetFieldLabel: 'Transaction Status', dataType: 'string', required: true, sourceHeader: 'Txn_State', transformationRule: 'uppercase' },
            { targetFieldKey: 'response_code', targetFieldLabel: 'Response Code', dataType: 'string', required: false, sourceHeader: 'Iso_Resp', defaultValue: '00' },
            { targetFieldKey: 'category', targetFieldLabel: 'Category', dataType: 'string', required: false, sourceHeader: 'Clearing_Cat' }
        ],
        authorName: 'kirubel_ops',
        createdAt: '2026-07-20T14:00:00Z',
        updatedAt: '2026-08-05T09:15:00Z'
    }
];
export const INITIAL_UPLOADED_TRANSACTIONS = [
    {
        id: 'WDB-TXN-9001',
        batchId: 'BATCH-20260809-A71F',
        sourceFilename: 'chargebacks_august_clearing.csv',
        uploadedBy: 'kirubel_ops',
        uploadedAt: '2026-08-09T06:30:00Z',
        templateId: 'tpl-2',
        templateName: 'Stripe Dispute & Chargeback Export',
        mappedData: {
            transaction_id: 'TXN-9021',
            card_number: '4111********9982',
            amount_usd: 149.99,
            currency: 'USD',
            customer_email: 'john.smith@gmail.com',
            merchant_id: 'MERCH-8821',
            auth_time: '2026-08-09T04:12:00Z',
            status: 'CHARGEBACK',
            response_code: '05',
            category: 'DUPLICATE_AUTH'
        },
        rawRecord: {
            charge_id: 'TXN-9021',
            card_fingerprint: '4111********9982',
            charge_amount: '$149.99',
            buyer_email: 'john.smith@gmail.com',
            merchant_account: 'MERCH-8821',
            created_date: '2026-08-09T04:12:00Z',
            dispute_status: 'CHARGEBACK',
            reason_code: 'DUPLICATE_AUTH'
        },
        isReconciled: false
    },
    {
        id: 'WDB-TXN-9002',
        batchId: 'BATCH-20260809-A71F',
        sourceFilename: 'chargebacks_august_clearing.csv',
        uploadedBy: 'kirubel_ops',
        uploadedAt: '2026-08-09T06:30:00Z',
        templateId: 'tpl-2',
        templateName: 'Stripe Dispute & Chargeback Export',
        mappedData: {
            transaction_id: 'TXN-9022',
            card_number: '4111********9982',
            amount_usd: 149.99,
            currency: 'USD',
            customer_email: 'john.smith@gmail.com',
            merchant_id: 'MERCH-8821',
            auth_time: '2026-08-09T04:12:30Z',
            status: 'CHARGEBACK',
            response_code: '05',
            category: 'DUPLICATE_AUTH'
        },
        rawRecord: {
            charge_id: 'TXN-9022',
            card_fingerprint: '4111********9982',
            charge_amount: '$149.99',
            buyer_email: 'john.smith@gmail.com',
            merchant_account: 'MERCH-8821',
            created_date: '2026-08-09T04:12:30Z',
            dispute_status: 'CHARGEBACK',
            reason_code: 'DUPLICATE_AUTH'
        },
        isReconciled: true,
        notes: 'Reconciled via SQL resolution script execution'
    },
    {
        id: 'WDB-TXN-9003',
        batchId: 'BATCH-20260808-B902',
        sourceFilename: 'visa_settlement_daily.csv',
        uploadedBy: 'tech_sarah',
        uploadedAt: '2026-08-08T18:15:00Z',
        templateId: 'tpl-3',
        templateName: 'Visa ISO 8583 Settlement Clearing',
        mappedData: {
            transaction_id: 'TXN-8812',
            card_number: '5500********1290',
            amount_usd: 450.00,
            currency: 'USD',
            customer_email: 'sarah.m@retailpay.io',
            merchant_id: 'TERM-4001',
            auth_time: '2026-08-08T17:45:00Z',
            status: 'SETTLED',
            response_code: '00',
            category: 'CLEARING_OK'
        },
        rawRecord: {
            Ref_Number: 'TXN-8812',
            PAN_Masked: '5500********1290',
            Txn_Val_USD: '450.00',
            Cardholder_Mail: 'sarah.m@retailpay.io',
            Term_ID: 'TERM-4001',
            Iso_Timestamp: '2026-08-08T17:45:00Z',
            Txn_State: 'SETTLED',
            Iso_Resp: '00'
        },
        isReconciled: true
    }
];
export const INITIAL_UPLOAD_AUDIT_LOGS = [
    {
        id: 'AUD-LOG-101',
        batchId: 'BATCH-20260809-A71F',
        sourceFilename: 'chargebacks_august_clearing.csv',
        totalRecords: 2,
        successCount: 2,
        errorCount: 0,
        uploadedBy: 'kirubel_ops',
        uploadedAt: '2026-08-09T06:30:00Z',
        templateId: 'tpl-2',
        templateName: 'Stripe Dispute & Chargeback Export',
        fileSizeBytes: 4280
    },
    {
        id: 'AUD-LOG-102',
        batchId: 'BATCH-20260808-B902',
        sourceFilename: 'visa_settlement_daily.csv',
        totalRecords: 1,
        successCount: 1,
        errorCount: 0,
        uploadedBy: 'tech_sarah',
        uploadedAt: '2026-08-08T18:15:00Z',
        templateId: 'tpl-3',
        templateName: 'Visa ISO 8583 Settlement Clearing',
        fileSizeBytes: 2150
    }
];
export const INITIAL_WORKSPACE_TABLE_RECORDS = [
    {
        id: 'wtr-1001',
        file_name: 'amazon_txn_discrepancy.csv',
        user: 'kirubel_ops',
        user_id: 'usr-2',
        tag: '#DUPLICATE_AUTH',
        task_id: 'ISSUE-1001',
        mapping_id: 'tpl-1',
        mapping_name: 'Core Retail Banking Mapping',
        list_of_values_from_one_row: ['TXN-9021', '4111********9982', '149.99', 'PENDING', '2026-07-11T04:12:00Z', 'buyer.ops@amazon.com', 'AMAZON.COM*OPERATIONS', '00', 'USD', 'TERM-08'],
        transformed_data: {
            transaction_id: 'TXN-9021',
            card_number: '4111********9982',
            amount_usd: 149.99,
            status_state: 'PENDING',
            created_at: '2026-07-11T04:12:00Z',
            user_email: 'buyer.ops@amazon.com',
            merchant_id: 'AMAZON.COM*OPERATIONS',
            response_code: '00',
            currency: 'USD',
            terminal_id: 'TERM-08',
            dispute_reason: 'DUPLICATE_AUTH_BURST',
            batch_seq_num: 'BATCH-8021'
        },
        raw_data: {
            Txn_ID: 'TXN-9021',
            Card_Number: '4111********9982',
            Amount_USD: '149.99',
            Status: 'PENDING',
            Auth_Time: '2026-07-11T04:12:00Z',
            Customer_Email: 'buyer.ops@amazon.com',
            Merchant_ID: 'AMAZON.COM*OPERATIONS'
        },
        createdAt: '2026-08-09T06:30:00Z'
    },
    {
        id: 'wtr-1002',
        file_name: 'amazon_txn_discrepancy.csv',
        user: 'kirubel_ops',
        user_id: 'usr-2',
        tag: '#DUPLICATE_AUTH',
        task_id: 'ISSUE-1001',
        mapping_id: 'tpl-1',
        mapping_name: 'Core Retail Banking Mapping',
        list_of_values_from_one_row: ['TXN-9022', '4111********9982', '149.99', 'PENDING', '2026-07-11T04:12:30Z', 'buyer.ops@amazon.com', 'AMAZON.COM*OPERATIONS', '00', 'USD', 'TERM-08'],
        transformed_data: {
            transaction_id: 'TXN-9022',
            card_number: '4111********9982',
            amount_usd: 149.99,
            status_state: 'PENDING',
            created_at: '2026-07-11T04:12:30Z',
            user_email: 'buyer.ops@amazon.com',
            merchant_id: 'AMAZON.COM*OPERATIONS',
            response_code: '00',
            currency: 'USD',
            terminal_id: 'TERM-08',
            dispute_reason: 'DUPLICATE_AUTH_BURST',
            batch_seq_num: 'BATCH-8021'
        },
        raw_data: {
            Txn_ID: 'TXN-9022',
            Card_Number: '4111********9982',
            Amount_USD: '149.99',
            Status: 'PENDING',
            Auth_Time: '2026-07-11T04:12:30Z',
            Customer_Email: 'buyer.ops@amazon.com',
            Merchant_ID: 'AMAZON.COM*OPERATIONS'
        },
        createdAt: '2026-08-09T06:30:00Z'
    },
    {
        id: 'wtr-1003',
        file_name: 'stripe_chargebacks_july.csv',
        user: 'tech_sarah',
        user_id: 'usr-3',
        tag: '#REVERSED_FEE',
        task_id: 'ISS-102',
        mapping_id: 'tpl-2',
        mapping_name: 'Stripe Dispute & Chargeback Export',
        list_of_values_from_one_row: ['TXN-7789', '3782********1005', '89.50', 'DECLINED', '2026-07-12T11:20:00Z', 'alex.f@retail.co', 'STRIPE_US_DIRECT', '51', 'USD', 'TERM-02'],
        transformed_data: {
            transaction_id: 'TXN-7789',
            card_number: '3782********1005',
            amount_usd: 89.50,
            status_state: 'DECLINED',
            created_at: '2026-07-12T11:20:00Z',
            user_email: 'alex.f@retail.co',
            merchant_id: 'STRIPE_US_DIRECT',
            response_code: '51',
            currency: 'USD',
            terminal_id: 'TERM-02',
            dispute_reason: 'REVERSAL_TIMEOUT',
            batch_seq_num: 'BATCH-8891'
        },
        raw_data: {
            charge_id: 'TXN-7789',
            card_num: '3782********1005',
            charge_amount: '89.50',
            dispute_status: 'DECLINED',
            buyer_email: 'alex.f@retail.co',
            merchant_account: 'STRIPE_US_DIRECT'
        },
        createdAt: '2026-08-09T07:15:00Z'
    }
];
export const INITIAL_GLOBAL_STANDARD_DIRECTORY_RECORDS = [];
export const INITIAL_WORKFLOWS = [
    {
        id: 'wf-recon-multi-stage-1',
        name: 'End-to-End Multi-Stage Transaction Reconciliation',
        description: 'Stage-aware investigation pipeline verifying ingestion, authorization response codes, and downstream settlement reconciliation.',
        targetDbId: 'db-1',
        targetTable: 'transactions',
        category: 'Reconciliation',
        version: '2.1.0',
        stages: [
            {
                id: 'stage-1-auth',
                name: 'Stage 1: Authorization & Ingress Verification',
                description: 'Verify transaction presence and gateway authorization response status in the primary database node.',
                order: 1,
                enabled: true,
                targetDbId: 'db-1',
                targetDataSource: 'transactions',
                businessMeaning: 'Authorization Ingress'
            },
            {
                id: 'stage-2-settlement',
                name: 'Stage 2: Clearing & Settlement Verification',
                description: 'Cross-verify settled charge amounts and ledger posting state in the secondary settlement repository.',
                order: 2,
                enabled: true,
                targetDbId: 'db-1',
                targetDataSource: 'transactions',
                businessMeaning: 'Financial Settlement'
            }
        ],
        steps: [
            {
                id: 'step-auth-existence',
                stepNumber: 1,
                name: 'Auth Ingress Existence Check',
                description: 'Verify transaction identifier is registered in the authorization node.',
                stageId: 'stage-1-auth',
                checkType: 'EXISTENCE_CHECK',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                sourceField: 'transaction_id',
                requiredParams: ['transaction_id'],
                optionalParams: [],
                dependencyCondition: 'ALWAYS',
                onPassAction: 'CONTINUE',
                onFailAction: 'STOP',
                onErrorAction: 'STOP',
                successMessage: 'Transaction confirmed in authorization ingress stage.',
                failureMessage: 'Transaction not found in authorization ingress node (404 Missing).',
                severityOnFailure: 'CRITICAL'
            },
            {
                id: 'step-auth-decline',
                stepNumber: 2,
                name: 'ISO-8583 Response Code Validation',
                description: 'Confirm gateway returned 00 (Approved) without card issuer decline codes.',
                stageId: 'stage-1-auth',
                checkType: 'ISO_DECLINE_CODE',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                sourceField: 'response_code',
                compareValue: '00',
                requiredParams: ['response_code'],
                optionalParams: [],
                dependencyCondition: 'IF_PREV_SUCCESS',
                onPassAction: 'CONTINUE',
                onFailAction: 'CONTINUE',
                onErrorAction: 'STOP',
                successMessage: 'Transaction approved clean with code 00.',
                failureMessage: 'Card issuer decline code detected in authorization stage.',
                severityOnFailure: 'WARNING'
            },
            {
                id: 'step-settlement-amount',
                stepNumber: 3,
                name: 'Settlement Amount Match Check',
                description: 'Validate settled charge amount matches auth record exactly.',
                stageId: 'stage-2-settlement',
                checkType: 'AMOUNT_MATCH',
                targetDbId: 'db-1',
                targetTable: 'transactions',
                sourceField: 'amount_usd',
                requiredParams: ['amount_usd'],
                optionalParams: [],
                dependencyCondition: 'IF_PREV_SUCCESS',
                onPassAction: 'CLOSE',
                onFailAction: 'STOP',
                onErrorAction: 'STOP',
                successMessage: 'Settlement amount balanced. Investigation reconciled clean.',
                failureMessage: 'Settlement amount mismatch detected in clearing stage.',
                severityOnFailure: 'CRITICAL'
            }
        ],
        globalSuccessMessage: 'All processing stages reconciled successfully. Transaction verified.',
        globalFailureMessage: 'Discrepancies identified across processing stages.',
        createdBy: 'system',
        createdAt: '2026-08-01T10:00:00Z',
        updatedAt: '2026-09-03T12:00:00Z',
        isSystemDefault: true
    }
];
export class DataStore {
    users = [...INITIAL_USERS];
    issues = [];
    hashtags = [];
    plugins = [];
    databases = [];
    systems = [];
    teams = [];
    queryApprovals = [];
    dbAccessRequests = [];
    connectionLogs = [];
    notifications = [];
    directMessages = [];
    teamTasks = [];
    teamInsights = [];
    teamMessages = [];
    organizations = [];
    globalSchema = {
        version: '2.3.0',
        updatedAt: new Date().toISOString(),
        updatedBy: 'system',
        standardFields: [],
        tableMappings: {},
        versionHistory: [],
        strictMappingEnforced: true
    };
    tableMappings = {};
    transactionTemplates = [];
    uploadedTransactions = [];
    uploadAuditLogs = [];
    workspaceTableRecords = [];
    globalStandardDirectory = [];
    workflows = [];
    queryExtractions = [];
    investigationTasks = [];
    investigationBatches = [];
    investigationTransactions = [];
    centralTransactions = [];
    validationBoxes = [];
    columnConfigurations = [];
    teamRelationships = [];
}
export const store = new DataStore();
