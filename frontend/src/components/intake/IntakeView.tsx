/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Inbox, RefreshCw, Search, Mail, FileText, ChevronRight, X,
  CheckCircle2, AlertTriangle, Terminal, Server, Shield, Eye,
  Play, Check, Plus, ExternalLink, ArrowUpRight, Clock, UserCheck,
  Calendar, Layers, Zap, Database, RotateCcw, Settings2, SlidersHorizontal,
  Briefcase, Hash, FileSpreadsheet, Archive, Send, ChevronDown, ChevronUp
} from 'lucide-react';
import { Team, User, FtpFileStagingConfig, Issue } from '../../types';
import { api } from '../../api/client';
import { ErrorBoundary } from '../ErrorBoundary';
import { DataTablePagination } from '../common/DataTablePagination';
import { FtpScheduleConfigModal } from './FtpScheduleConfigModal';

interface IntakeViewProps {
  currentTeam?: Team | null;
  currentUser?: User | null;
  onNavigateToCase?: (caseId: string) => void;
  onNavigateToCreateTask?: (prefill?: any) => void;
  issues?: Issue[];
}

export const IntakeView: React.FC<IntakeViewProps> = ({ 
  currentTeam = null, 
  currentUser = null,
  onNavigateToCase,
  onNavigateToCreateTask,
  issues = []
}) => {
  return (
    <ErrorBoundary fallbackTitle="Intake Cockpit Error">
      <IntakeViewContent 
        currentTeam={currentTeam} 
        currentUser={currentUser} 
        onNavigateToCase={onNavigateToCase} 
        onNavigateToCreateTask={onNavigateToCreateTask}
        issues={issues}
      />
    </ErrorBoundary>
  );
};

const DEFAULT_INTAKE_ITEMS = [
  {
    id: 'stg-sinqee-001',
    channel: 'email',
    subject: 'Re: Fwd: Re: Fw: SINQEE Settlement on t+1 bases',
    sender_name: 'REBUMA SHUMA DELESA',
    sender_address: 'rebuma.shuma@sinqeebank.et',
    category: 'Reconciliation exception',
    urgency: 'normal',
    confidence_score: 0.80,
    attachments: [
      {
        id: 'att-sinqee-01',
        filename: 'sinqee_t1_clearing_feed.xlsx',
        size: '245 KB',
        contentType: 'spreadsheet',
        parsedData: {
          sampleHeaders: ['Txn_Ref', 'Card_Pan', 'Settlement_Date', 'Amount_ETB', 'Terminal_Id', 'Response_Code', 'Settlement_Status'],
          sampleRows: [
            { Txn_Ref: 'TXN-SINQ-1001', Card_Pan: '5061********4412', Settlement_Date: '2026-10-21', Amount_ETB: 125000.00, Terminal_Id: 'ATM-AA-09', Response_Code: '00', Settlement_Status: 'SETTLED' },
            { Txn_Ref: 'TXN-SINQ-1002', Card_Pan: '5061********8831', Settlement_Date: '2026-10-21', Amount_ETB: 45000.00, Terminal_Id: 'POS-BOLE-01', Response_Code: '00', Settlement_Status: 'SETTLED' },
            { Txn_Ref: 'TXN-SINQ-1003', Card_Pan: '5061********1190', Settlement_Date: '2026-10-21', Amount_ETB: 320000.50, Terminal_Id: 'ATM-HAWASSA-02', Response_Code: '05', Settlement_Status: 'DISCREPANCY' },
            { Txn_Ref: 'TXN-SINQ-1004', Card_Pan: '5061********7724', Settlement_Date: '2026-10-21', Amount_ETB: 15400.00, Terminal_Id: 'POS-PIASSA-03', Response_Code: '00', Settlement_Status: 'SETTLED' },
            { Txn_Ref: 'TXN-SINQ-1005', Card_Pan: '5061********9025', Settlement_Date: '2026-10-21', Amount_ETB: 89000.00, Terminal_Id: 'ATM-ADAMA-01', Response_Code: '00', Settlement_Status: 'SETTLED' }
          ]
        }
      },
      {
        id: 'att-sinqee-02',
        filename: 'sinqee_reversal_exceptions.csv',
        size: '42 KB',
        contentType: 'spreadsheet',
        parsedData: {
          sampleHeaders: ['Txn_Ref', 'Orig_Ref', 'Dispute_Type', 'Amount_ETB', 'Terminal_Id', 'Reason'],
          sampleRows: [
            { Txn_Ref: 'REV-SINQ-2001', Orig_Ref: 'TXN-SINQ-1003', Dispute_Type: 'ATM_DISPENSE_FAIL', Amount_ETB: 320000.50, Terminal_Id: 'ATM-HAWASSA-02', Reason: 'Customer cash unpresent' },
            { Txn_Ref: 'REV-SINQ-2002', Orig_Ref: 'TXN-SINQ-1009', Dispute_Type: 'POS_DUPLICATE_CHARGE', Amount_ETB: 12500.00, Terminal_Id: 'POS-BOLE-02', Reason: 'Network timeout replay' }
          ]
        }
      }
    ],
    status: 'READY_FOR_TASK_CREATION',
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    raw_payload: JSON.stringify({
      batchId: 'BATCH-SINQEE-8821',
      settlementDate: '2026-10-21',
      totalAmount: 4500000.00,
      currency: 'ETB',
      notes: 'Discrepancy observed against national switch settlement log.'
    }, null, 2),
    parsed_fields: {
      caseReference: 'ISS-SINQEE-01',
      priority: 'Medium',
      entity: 'Sinqee Bank'
    }
  },
  {
    id: 'stg-decline-002',
    channel: 'email',
    subject: 'Daily Decline Status',
    sender_name: 'Yared Kibru',
    sender_address: 'yared.kibru@ethiopay.et',
    category: 'Payment failure',
    urgency: 'normal',
    confidence_score: 0.60,
    attachments: [
      {
        id: 'att-decline-01',
        filename: 'decline_report.csv',
        size: '180 KB',
        contentType: 'spreadsheet',
        parsedData: {
          sampleHeaders: ['Txn_Ref', 'Card_Pan', 'Decline_Reason', 'Amount', 'Currency', 'ISO_Code', 'Timestamp'],
          sampleRows: [
            { Txn_Ref: 'DEC-2026-001', Card_Pan: '6221********9901', Decline_Reason: 'Insufficient Funds', Amount: 5400.00, Currency: 'ETB', ISO_Code: 'ISO-51', Timestamp: '2026-10-22 09:12:14' },
            { Txn_Ref: 'DEC-2026-002', Card_Pan: '6221********4418', Decline_Reason: 'Do Not Honor', Amount: 18200.00, Currency: 'ETB', ISO_Code: 'ISO-05', Timestamp: '2026-10-22 09:14:50' },
            { Txn_Ref: 'DEC-2026-003', Card_Pan: '6221********3310', Decline_Reason: 'Expired Card', Amount: 2100.00, Currency: 'ETB', ISO_Code: 'ISO-54', Timestamp: '2026-10-22 09:20:11' },
            { Txn_Ref: 'DEC-2026-004', Card_Pan: '6221********7762', Decline_Reason: 'Exceeds Withdrawal Limit', Amount: 50000.00, Currency: 'ETB', ISO_Code: 'ISO-61', Timestamp: '2026-10-22 09:25:33' }
          ]
        }
      }
    ],
    status: 'NEW',
    created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    raw_payload: JSON.stringify({
      source: 'POS_GATEWAY',
      declineCount: 142,
      errorCodes: ['ISO-51', 'ISO-05']
    }, null, 2),
    parsed_fields: {
      priority: 'Medium',
      entity: 'Card Switch'
    }
  },
  {
    id: 'stg-eod-003',
    channel: 'email',
    subject: 'Re: Daily EOD Status',
    sender_name: 'Samrawit Legesse',
    sender_address: 'samrawit.l@ethiopay.et',
    category: 'General inquiry',
    urgency: 'normal',
    confidence_score: 0.50,
    attachments: [{ filename: 'eod_summary.pdf' }],
    status: 'NEW',
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    raw_payload: JSON.stringify({
      subject: 'End of day operational clearance confirmation'
    }, null, 2),
    parsed_fields: {
      priority: 'Low'
    }
  },
  {
    id: 'stg-onboard-004',
    channel: 'email',
    subject: 'Re: FTP onbording Notice',
    sender_name: 'Mesfin Alemayehu Silesh',
    sender_address: 'mesfin.a@awashbank.com',
    category: 'General inquiry',
    urgency: 'normal',
    confidence_score: 0.50,
    attachments: [],
    status: 'NEW',
    created_at: new Date(Date.now() - 3600000 * 7).toISOString(),
    raw_payload: JSON.stringify({
      endpoint: 'sftp://staging.awashbank.com:22/settlement',
      protocol: 'SFTP'
    }, null, 2),
    parsed_fields: {
      priority: 'Normal'
    }
  },
  {
    id: 'stg-gadaa-005',
    channel: 'email',
    subject: 'Re: FTP onbording Notice',
    sender_name: 'yemisracht@gadaabank.com.et',
    sender_address: 'yemisracht@gadaabank.com.et',
    category: 'Reconciliation exception',
    urgency: 'normal',
    confidence_score: 0.70,
    attachments: [],
    status: 'READY_FOR_TASK_CREATION',
    created_at: new Date(Date.now() - 3600000 * 9).toISOString(),
    raw_payload: JSON.stringify({
      bank: 'Gadaa Bank',
      status: 'Ready for batch matching'
    }, null, 2),
    parsed_fields: {
      priority: 'Medium'
    }
  },
  {
    id: 'stg-shambel-006',
    channel: 'email',
    subject: 'Re: FTP onbording Notice',
    sender_name: 'Tolemariam Shambel',
    sender_address: 'tolemariam.s@ethiopay.et',
    category: 'General inquiry',
    urgency: 'normal',
    confidence_score: 0.50,
    attachments: [{ filename: 'spec_v1.pdf' }, { filename: 'certs.pem' }],
    status: 'NEW',
    created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    raw_payload: JSON.stringify({
      channel: 'FTP Staging'
    }, null, 2),
    parsed_fields: {
      priority: 'Low'
    }
  },
  {
    id: 'stg-cbe-007',
    channel: 'email',
    subject: 'CBE POS Acquirer Batch Variance Report',
    sender_name: 'Abebe Bikila',
    sender_address: 'abebe.b@cbe.com.et',
    category: 'Reconciliation exception',
    urgency: 'critical',
    confidence_score: 0.92,
    attachments: [{ filename: 'cbe_pos_variance_20261022.xlsx', size: '1.2 MB' }],
    status: 'READY_FOR_TASK_CREATION',
    created_at: new Date(Date.now() - 3600000 * 14).toISOString(),
    raw_payload: JSON.stringify({
      bank: 'Commercial Bank of Ethiopia',
      discrepancyCount: 38,
      totalAmountETB: 8940000.50
    }, null, 2),
    parsed_fields: {
      caseReference: 'ISS-CBE-POS-07',
      priority: 'Critical',
      entity: 'Commercial Bank of Ethiopia'
    }
  },
  {
    id: 'stg-dashen-008',
    channel: 'email',
    subject: 'Dashen Bank ATM Dispense Discrepancy Log',
    sender_name: 'Selamawit Tadesse',
    sender_address: 'selamawit.t@dashenbanksc.com',
    category: 'ATM exception',
    urgency: 'high',
    confidence_score: 0.85,
    attachments: [{ filename: 'dashen_atm_dispense_log.csv', size: '512 KB' }],
    status: 'NEW',
    created_at: new Date(Date.now() - 3600000 * 16).toISOString(),
    raw_payload: JSON.stringify({
      terminalId: 'ATM-DASHEN-4401',
      dispenseErrors: 12,
      varianceAmount: 48000.00
    }, null, 2),
    parsed_fields: {
      priority: 'High',
      entity: 'Dashen Bank'
    }
  },
  {
    id: 'stg-telebirr-009',
    channel: 'teams',
    subject: 'Telebirr Wallet Interoperability Clearing File',
    sender_name: 'Kalkidan Mulugeta',
    sender_address: 'kalkidan.m@ethiotelecom.et',
    category: 'Wallet settlement',
    urgency: 'normal',
    confidence_score: 0.88,
    attachments: [{ filename: 'telebirr_clearing_oct24.csv', size: '3.4 MB' }],
    status: 'READY_FOR_TASK_CREATION',
    created_at: new Date(Date.now() - 3600000 * 18).toISOString(),
    raw_payload: JSON.stringify({
      feedType: 'P2M_INTEROP',
      recordCount: 14200,
      clearingWindow: 'T+0_EVENING'
    }, null, 2),
    parsed_fields: {
      priority: 'Medium',
      entity: 'Ethio Telecom (Telebirr)'
    }
  },
  {
    id: 'stg-nib-010',
    channel: 'email',
    subject: 'NIB International Bank ISO-8583 Settlement Feed',
    sender_name: 'Dawit Haile',
    sender_address: 'dawit.h@nibbanket.com',
    category: 'Reconciliation exception',
    urgency: 'normal',
    confidence_score: 0.78,
    attachments: [{ filename: 'nib_iso_settlement.xml', size: '890 KB' }],
    status: 'CONVERTED_TO_TASK',
    created_at: new Date(Date.now() - 3600000 * 20).toISOString(),
    raw_payload: JSON.stringify({
      switchBatch: 'SW-NIB-9921',
      matchedCount: 4200,
      unmatchedCount: 7
    }, null, 2),
    parsed_fields: {
      caseReference: 'ISS-NIB-9921',
      priority: 'Normal',
      entity: 'Nib Bank'
    }
  },
  {
    id: 'stg-coop-011',
    channel: 'email',
    subject: 'Cooperative Bank of Oromia Dispute Triage',
    sender_name: 'Gemechu Megersa',
    sender_address: 'gemechu.m@coopbankoromia.com.et',
    category: 'Dispute escalation',
    urgency: 'high',
    confidence_score: 0.90,
    attachments: [{ filename: 'coop_dispute_bundle.zip', size: '2.1 MB' }],
    status: 'ESCALATED',
    created_at: new Date(Date.now() - 3600000 * 22).toISOString(),
    raw_payload: JSON.stringify({
      disputeType: 'CHARGEBACK_REVERSAL',
      slaDeadline: '2026-10-29T16:00:00Z'
    }, null, 2),
    parsed_fields: {
      caseReference: 'ESC-COOP-011',
      priority: 'High',
      entity: 'Coop Bank of Oromia'
    }
  },
  {
    id: 'stg-wegagen-012',
    channel: 'email',
    subject: 'Wegagen Bank Chargeback Document Bundle',
    sender_name: 'Tigist Assefa',
    sender_address: 'tigist.a@wegagenbank.com.et',
    category: 'Chargeback review',
    urgency: 'normal',
    confidence_score: 0.82,
    attachments: [{ filename: 'wegagen_chargebacks.pdf', size: '1.5 MB' }],
    status: 'READY_FOR_TASK_CREATION',
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    raw_payload: JSON.stringify({
      bank: 'Wegagen Bank',
      caseCount: 16
    }, null, 2),
    parsed_fields: {
      priority: 'Medium',
      entity: 'Wegagen Bank'
    }
  },
  {
    id: 'stg-abyssinia-013',
    channel: 'email',
    subject: 'Bank of Abyssinia Clearing Fee Rounding Discrepancy',
    sender_name: 'Natnael Girma',
    sender_address: 'natnael.g@bankofabyssinia.com',
    category: 'Fee discrepancy',
    urgency: 'critical',
    confidence_score: 0.95,
    attachments: [{ filename: 'boa_fee_rounding_audit.xlsx', size: '640 KB' }],
    status: 'READY_FOR_TASK_CREATION',
    created_at: new Date(Date.now() - 3600000 * 26).toISOString(),
    raw_payload: JSON.stringify({
      bank: 'Bank of Abyssinia',
      roundingDelta: 31250.75,
      impactedTransactions: 124
    }, null, 2),
    parsed_fields: {
      caseReference: 'ISS-BOA-FEE-13',
      priority: 'Critical',
      entity: 'Bank of Abyssinia'
    }
  },
  {
    id: 'stg-zemen-014',
    channel: 'email',
    subject: 'Zemen Bank Corporate Settlement Reconciliation',
    sender_name: 'Almaz Tefera',
    sender_address: 'almaz.t@zemenbank.com',
    category: 'Corporate settlement',
    urgency: 'normal',
    confidence_score: 0.84,
    attachments: [{ filename: 'zemen_corp_feed.csv', size: '320 KB' }],
    status: 'NEW',
    created_at: new Date(Date.now() - 3600000 * 28).toISOString(),
    raw_payload: JSON.stringify({
      corporateId: 'CORP-MIDROC-88',
      transferCount: 45
    }, null, 2),
    parsed_fields: {
      priority: 'Medium',
      entity: 'Zemen Bank'
    }
  },
  {
    id: 'stg-oromia-015',
    channel: 'email',
    subject: 'Oromia Bank Switch Anomaly Notification',
    sender_name: 'Tolosa Feyissa',
    sender_address: 'tolosa.f@oromiabank.com',
    category: 'System notice',
    urgency: 'low',
    confidence_score: 0.45,
    attachments: [],
    status: 'REJECTED',
    created_at: new Date(Date.now() - 3600000 * 30).toISOString(),
    raw_payload: JSON.stringify({
      note: 'Duplicate inquiry, already triaged under batch SW-ORO-11'
    }, null, 2),
    parsed_fields: {
      priority: 'Low',
      entity: 'Oromia Bank'
    }
  },
  {
    id: 'stg-hibret-016',
    channel: 'email',
    subject: 'Hibret Bank Merchant Settlement Exception',
    sender_name: 'Binyam Alemu',
    sender_address: 'binyam.a@hibretbank.com.et',
    category: 'Merchant settlement',
    urgency: 'high',
    confidence_score: 0.89,
    attachments: [{ filename: 'hibret_merchant_recon.xlsx', size: '780 KB' }],
    status: 'READY_FOR_TASK_CREATION',
    created_at: new Date(Date.now() - 3600000 * 32).toISOString(),
    raw_payload: JSON.stringify({
      merchantId: 'MCH-HYATT-REGENCY',
      discrepancyTotal: 67200.00
    }, null, 2),
    parsed_fields: {
      caseReference: 'ISS-HIBRET-MCH-16',
      priority: 'High',
      entity: 'Hibret Bank'
    }
  },
  {
    id: 'stg-enat-017',
    channel: 'email',
    subject: 'Enat Bank Micro-Loan Batch Clearing File',
    sender_name: 'Hanna Wolde',
    sender_address: 'hanna.w@enatbanksc.com',
    category: 'Loan clearance',
    urgency: 'normal',
    confidence_score: 0.77,
    attachments: [{ filename: 'enat_microloan_t1.csv', size: '410 KB' }],
    status: 'CONVERTED_TO_TASK',
    created_at: new Date(Date.now() - 3600000 * 34).toISOString(),
    raw_payload: JSON.stringify({
      loanBatchId: 'LN-ENAT-7741',
      totalDisbursed: 1250000.00
    }, null, 2),
    parsed_fields: {
      caseReference: 'ISS-ENAT-7741',
      priority: 'Normal',
      entity: 'Enat Bank'
    }
  },
  {
    id: 'stg-lion-018',
    channel: 'email',
    subject: 'Lion International Bank End of Month Settlement Sweep',
    sender_name: 'Yosef Kassa',
    sender_address: 'yosef.k@anbesabank.com.et',
    category: 'Reconciliation exception',
    urgency: 'critical',
    confidence_score: 0.94,
    attachments: [{ filename: 'lion_eom_settlement.xlsx', size: '1.8 MB' }],
    status: 'READY_FOR_TASK_CREATION',
    created_at: new Date(Date.now() - 3600000 * 36).toISOString(),
    raw_payload: JSON.stringify({
      sweepId: 'SWEEP-LION-OCT',
      unreconciledNet: 145800.00
    }, null, 2),
    parsed_fields: {
      caseReference: 'ISS-LION-EOM-18',
      priority: 'Critical',
      entity: 'Lion International Bank'
    }
  }
];

const IntakeViewContent: React.FC<IntakeViewProps> = ({ 
  currentTeam, 
  currentUser,
  onNavigateToCase,
  onNavigateToCreateTask,
  issues: propIssues = []
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'created_tasks' | 'requests' | 'ftp_feeds' | 'providers' | 'webhooks' | 'simulator'>('created_tasks');
  const [createdTasks, setCreatedTasks] = useState<Issue[]>(propIssues);

  useEffect(() => {
    if (propIssues && propIssues.length > 0) {
      setCreatedTasks(propIssues);
    }
  }, [propIssues]);

  // Created Tasks Tab State
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState('ALL');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState('ALL');
  const [taskPage, setTaskPage] = useState(1);
  const [taskPageSize, setTaskPageSize] = useState(7);

  const [quickTaskModalOpen, setQuickTaskModalOpen] = useState(false);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskDesc, setQuickTaskDesc] = useState('');
  const [quickTaskPriority, setQuickTaskPriority] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Medium');
  const [isSubmittingQuickTask, setIsSubmittingQuickTask] = useState(false);
  
  // Data State
  const [summary, setSummary] = useState<any>({
    totalInbound: 110,
    pendingTriage: 60,
    readyForTaskCreation: 41,
    convertedToTask: 9,
    escalatedCount: 0,
    slaBreachCount: 101
  });
  const [stagedMessages, setStagedMessages] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [configs, setConfigs] = useState<any[]>([]);
  const [ftpConfigs, setFtpConfigs] = useState<FtpFileStagingConfig[]>([]);
  const [isInitiatingIntake, setIsInitiatingIntake] = useState<Record<string, boolean>>({});
  const [isInitiatingAll, setIsInitiatingAll] = useState(false);
  const [selectedFtpConfigForSchedule, setSelectedFtpConfigForSchedule] = useState<FtpFileStagingConfig | null>(null);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [ftpSearchQuery, setFtpSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Pagination State for Requests Table
  const [requestPage, setRequestPage] = useState(1);
  const [requestPageSize, setRequestPageSize] = useState(7);

  // Pagination State for FTP Feeds Table
  const [ftpPage, setFtpPage] = useState(1);
  const [ftpPageSize, setFtpPageSize] = useState(7);

  // Selected item for review drawer
  const [selectedStaged, setSelectedStaged] = useState<any | null>(null);
  const [reviewDrawerOpen, setReviewDrawerOpen] = useState(false);

  // Maker / Checker Action Modals
  const [actionNotes, setActionNotes] = useState('');
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Quick Email / Channel Reply State
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replySuccessMsg, setReplySuccessMsg] = useState<string | null>(null);
  const [showRawPayload, setShowRawPayload] = useState(false);

  // Simulator State
  const [simChannel, setSimChannel] = useState<'email' | 'teams' | 'whatsapp' | 'telegram'>('email');
  const [simSender, setSimSender] = useState('corporate_client@partnerbank.com');
  const [simText, setSimText] = useState('URGENT: Reconcile attached settlement feed for account ACC-99214. Discrepancy amount $14,250.00 observed.');
  const [simRunning, setSimRunning] = useState(false);

  const teamId = currentTeam?.id || '';

  // Helpers for Created Tasks View
  const formatTaskDate = (dateStr?: string) => {
    if (!dateStr) return 'Recently';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const getPriorityClass = (priority?: string) => {
    switch ((priority || '').toUpperCase()) {
      case 'CRITICAL':
        return 'bg-rose-50 text-rose-700 border-rose-200 font-bold';
      case 'HIGH':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'MEDIUM':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const getStatusClass = (status?: string) => {
    switch ((status || '').toUpperCase()) {
      case 'OPEN':
      case 'READY':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'INVESTIGATING':
      case 'IN_PROGRESS':
      case 'TESTING':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'RESOLVED':
      case 'CLOSED':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'FLAGGED':
      case 'ESCALATED':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getStatusDot = (status?: string) => {
    switch ((status || '').toUpperCase()) {
      case 'OPEN':
      case 'READY':
        return 'bg-rose-500';
      case 'INVESTIGATING':
      case 'IN_PROGRESS':
      case 'TESTING':
        return 'bg-amber-500';
      case 'RESOLVED':
      case 'CLOSED':
        return 'bg-emerald-500';
      case 'FLAGGED':
      case 'ESCALATED':
        return 'bg-purple-500';
      default:
        return 'bg-slate-400';
    }
  };

  const taskMetrics = useMemo(() => {
    const total = createdTasks.length;
    const open = createdTasks.filter(t => ['OPEN', 'READY', 'Open'].includes(t.status as any)).length;
    const inProgress = createdTasks.filter(t => ['INVESTIGATING', 'IN_PROGRESS', 'TESTING', 'Investigating'].includes(t.status as any)).length;
    const resolved = createdTasks.filter(t => ['RESOLVED', 'CLOSED', 'Resolved', 'Closed'].includes(t.status as any)).length;
    const critical = createdTasks.filter(t => ['Critical', 'CRITICAL', 'High', 'HIGH'].includes(t.priority as any)).length;
    return { total, open, inProgress, resolved, critical };
  }, [createdTasks]);

  const filteredTasks = useMemo(() => {
    return createdTasks.filter(task => {
      if (taskStatusFilter !== 'ALL') {
        const normStatus = (task.status || '').toUpperCase();
        const normFilter = taskStatusFilter.toUpperCase();
        if (normFilter === 'OPEN' && !['OPEN', 'READY'].includes(normStatus)) return false;
        if (normFilter === 'INVESTIGATING' && !['INVESTIGATING', 'IN_PROGRESS', 'TESTING'].includes(normStatus)) return false;
        if (normFilter === 'RESOLVED' && !['RESOLVED', 'CLOSED'].includes(normStatus)) return false;
        if (normFilter === 'FLAGGED' && !['FLAGGED', 'ESCALATED', 'DISCREPANCY'].includes(normStatus)) return false;
      }

      if (taskPriorityFilter !== 'ALL') {
        if ((task.priority || '').toUpperCase() !== taskPriorityFilter.toUpperCase()) return false;
      }

      if (taskSearchQuery.trim()) {
        const q = taskSearchQuery.toLowerCase();
        const idMatch = (task.id || '').toLowerCase().includes(q);
        const titleMatch = (task.title || '').toLowerCase().includes(q);
        const descMatch = (task.description || '').toLowerCase().includes(q);
        const creatorMatch = (task.creatorName || '').toLowerCase().includes(q);
        const tagMatch = (task.linkedHashtag || '').toLowerCase().includes(q);
        const fileMatch = (task.uploadedFileName || '').toLowerCase().includes(q);
        if (!idMatch && !titleMatch && !descMatch && !creatorMatch && !tagMatch && !fileMatch) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [createdTasks, taskSearchQuery, taskStatusFilter, taskPriorityFilter]);

  const paginatedTasks = useMemo(() => {
    const start = (taskPage - 1) * taskPageSize;
    return filteredTasks.slice(start, start + taskPageSize);
  }, [filteredTasks, taskPage, taskPageSize]);

  const loadAllData = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [summ, staged, provs, cfgs, loadedFtp, loadedIssues] = await Promise.all([
        api.getExternalRequestSummary(teamId || undefined).catch(() => null),
        api.getStagedMessages(teamId ? { teamId, limit: 100 } : { limit: 100 }).catch(() => []),
        teamId ? api.getMessageProviders({ teamId }).catch(() => []) : Promise.resolve([]),
        teamId ? api.getTeamChannelConfigs(teamId).catch(() => []) : Promise.resolve([]),
        api.getFtpStagingConfigs().catch(() => []),
        api.getIssues().catch(() => [])
      ]);
      if (summ) setSummary(summ);
      if (Array.isArray(staged)) {
        setStagedMessages(staged);
        setSelectedStaged((prev: any) => {
          if (!prev) return null;
          const fresh = staged.find((s: any) => s.id === prev.id);
          return fresh || prev;
        });
      }
      if (Array.isArray(provs)) setProviders(provs);
      if (Array.isArray(cfgs)) setConfigs(cfgs);
      if (Array.isArray(loadedFtp)) {
        // Filter out duplicate configs with identical name and pattern to keep UI crystal clear
        const seen = new Set<string>();
        const uniqueFtp = loadedFtp.filter(c => {
          const key = `${c.name}::${c.fileNamePattern}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setFtpConfigs(uniqueFtp);
      }
      if (Array.isArray(loadedIssues) && loadedIssues.length > 0) {
        setCreatedTasks(loadedIssues);
      }
    } catch (err: any) {
      console.warn('Could not load dynamic intake data, using established cache:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInitiateSingleFtp = async (config: FtpFileStagingConfig) => {
    setIsInitiatingIntake(prev => ({ ...prev, [config.id]: true }));
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.stageFtpFile({
        configId: config.id,
        connectionId: config.ftpConnectionId
      });
      setSuccessMsg(
        `Intake initiated for [${config.name}]: Staged ${res.stagedCount?.toLocaleString() || 0} records into ${res.stagingTableName || 'mirror table'}.`
      );
      await loadAllData();
    } catch (err: any) {
      setErrorMsg(`Failed to initiate intake for [${config.name}]: ${err.message}`);
    } finally {
      setIsInitiatingIntake(prev => ({ ...prev, [config.id]: false }));
    }
  };

  const handleInitiateAllFtp = async () => {
    setIsInitiatingAll(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.runScheduledFtpStaging({ forceAll: true });
      setSuccessMsg(
        `Batch intake completed across ${res.executedCount || ftpConfigs.length} feed(s): Staged ${res.totalStaged?.toLocaleString() || 0} records into PostgreSQL mirror tables.`
      );
      await loadAllData();
    } catch (err: any) {
      setErrorMsg(`Failed to initiate batch intake: ${err.message}`);
    } finally {
      setIsInitiatingAll(false);
    }
  };

  const handleResetLedger = async (config: FtpFileStagingConfig) => {
    if (!confirm(`Reset the ingested files ledger for pattern "${config.fileNamePattern}"?\n\nThis will allow remote files matching this pattern to be re-staged on the next intake run.`)) {
      return;
    }
    try {
      await api.resetFtpPatternLedger(config.ftpConnectionId, config.fileNamePattern);
      setSuccessMsg(`Ingested files ledger reset for pattern [${config.fileNamePattern}]. Ready for fresh re-ingestion.`);
      await loadAllData();
    } catch (err: any) {
      setErrorMsg(`Could not reset ledger: ${err.message}`);
    }
  };

  const handleOpenScheduleModal = (config: FtpFileStagingConfig) => {
    setSelectedFtpConfigForSchedule(config);
    setIsScheduleModalOpen(true);
  };

  useEffect(() => {
    loadAllData();
  }, [teamId]);

  const filteredMessages = stagedMessages.filter(msg => {
    if (statusFilter !== 'ALL' && msg.status !== statusFilter) return false;
    if (urgencyFilter !== 'ALL' && msg.urgency !== urgencyFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const subject = (msg.subject || '').toLowerCase();
      const sender = (msg.sender_name || msg.senderName || msg.sender_address || msg.senderAddress || '').toLowerCase();
      const id = (msg.id || '').toLowerCase();
      if (!subject.includes(q) && !sender.includes(q) && !id.includes(q)) return false;
    }
    return true;
  });

  // Pagination for Requests Table
  const paginatedMessages = useMemo(() => {
    const start = (requestPage - 1) * requestPageSize;
    return filteredMessages.slice(start, start + requestPageSize);
  }, [filteredMessages, requestPage, requestPageSize]);

  // Pagination & Filtering for FTP Feeds Table
  const filteredFtpConfigs = useMemo(() => {
    return ftpConfigs.filter(c => {
      if (!ftpSearchQuery.trim()) return true;
      const query = ftpSearchQuery.toLowerCase();
      return (
        c.name.toLowerCase().includes(query) ||
        c.fileNamePattern.toLowerCase().includes(query) ||
        (c.stagingTableName || '').toLowerCase().includes(query) ||
        (c.ftpConnectionId || '').toLowerCase().includes(query) ||
        (c.fileFormat || '').toLowerCase().includes(query)
      );
    });
  }, [ftpConfigs, ftpSearchQuery]);

  const paginatedFtpConfigs = useMemo(() => {
    const start = (ftpPage - 1) * ftpPageSize;
    return filteredFtpConfigs.slice(start, start + ftpPageSize);
  }, [filteredFtpConfigs, ftpPage, ftpPageSize]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setRequestPage(1);
  }, [statusFilter, urgencyFilter, searchQuery]);

  useEffect(() => {
    setFtpPage(1);
  }, [ftpSearchQuery]);

  const handleOpenReview = (msg: any) => {
    setSelectedStaged(msg);
    setActionNotes('');
    setReplyText(`Hello ${msg.sender_name || msg.senderName || ''},\n\nWe acknowledge receipt of your settlement feed and our operational team is reviewing the records.\n\nBest regards,\nEthioPay Operations`);
    setReplySuccessMsg(null);
    setShowRawPayload(false);
    setReviewDrawerOpen(true);
  };

  const handleCreateTaskForAttachment = (att: any, msg: any) => {
    setReviewDrawerOpen(false);
    const fileName = att?.filename || 'attached_feed.xlsx';
    const cleanFileName = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    const formattedFileTitle = cleanFileName.charAt(0).toUpperCase() + cleanFileName.slice(1);
    const taskTitle = msg?.subject
      ? `${msg.subject} [${fileName}]`
      : formattedFileTitle;

    const priority = msg?.parsed_fields?.priority || (msg?.urgency === 'critical' ? 'Critical' : msg?.urgency === 'high' ? 'High' : 'Medium');
    const description = `Ingested from ${msg?.channel || 'Intake'} (${msg?.sender_address || msg?.senderAddress || ''})\nAttached File: ${fileName} (${att?.size || 'N/A'})\nCategory: ${msg?.category || 'Reconciliation exception'}${actionNotes ? `\nReview Notes: ${actionNotes}` : ''}`;

    if (onNavigateToCreateTask) {
      onNavigateToCreateTask({
        title: taskTitle,
        description,
        priority,
        sourceMessageId: msg?.id,
        attachments: [att],
        uploadedFileName: fileName,
        channel: msg?.channel || 'email',
        senderName: msg?.sender_name || msg?.senderName,
        senderAddress: msg?.sender_address || msg?.senderAddress,
        teamId: msg?.team_id || teamId,
        taskVisibility: 'TEAM_PUBLIC',
        attachmentId: att?.id
      });
    } else {
      setQuickTaskTitle(taskTitle);
      setQuickTaskDesc(description);
      setQuickTaskPriority(priority);
      setQuickTaskModalOpen(true);
    }
  };

  const handleCreateTaskWithoutAttachment = (msg: any) => {
    setReviewDrawerOpen(false);
    const taskTitle = msg?.subject || 'Intake Request Case';
    const priority = msg?.parsed_fields?.priority || (msg?.urgency === 'critical' ? 'Critical' : msg?.urgency === 'high' ? 'High' : 'Medium');
    const description = `Ingested from ${msg?.channel || 'Intake'} (${msg?.sender_address || msg?.senderAddress || ''})\nCategory: ${msg?.category || 'Reconciliation exception'}${actionNotes ? `\nReview Notes: ${actionNotes}` : ''}`;

    if (onNavigateToCreateTask) {
      onNavigateToCreateTask({
        title: taskTitle,
        description,
        priority,
        sourceMessageId: msg?.id,
        attachments: [],
        channel: msg?.channel || 'email',
        senderName: msg?.sender_name || msg?.senderName,
        senderAddress: msg?.sender_address || msg?.senderAddress,
        teamId: msg?.team_id || teamId,
        taskVisibility: 'TEAM_PUBLIC'
      });
    } else {
      setQuickTaskTitle(taskTitle);
      setQuickTaskDesc(description);
      setQuickTaskPriority(priority);
      setQuickTaskModalOpen(true);
    }
  };

  const handleSendReply = async () => {
    if (!selectedStaged || !replyText.trim()) return;
    setIsSendingReply(true);
    setReplySuccessMsg(null);
    try {
      const recipient = selectedStaged.sender_address || selectedStaged.senderAddress;
      await api.replyToStagedMessage(selectedStaged.id, {
        to: recipient,
        subject: `Re: ${selectedStaged.subject || 'Operational Request'}`,
        textBody: replyText.trim(),
        channel: selectedStaged.channel || 'email'
      });
      setReplySuccessMsg(`Reply successfully dispatched to ${recipient}!`);
      setTimeout(() => setReplySuccessMsg(null), 5000);
    } catch (err: any) {
      console.error('Failed to send reply via API:', err);
      setErrorMsg(`Failed to send reply: ${err?.message || 'Server error'}`);
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleCloseRequest = async (id: string, reason?: string) => {
    setIsProcessingAction(true);
    try {
      await api.closeStagedMessage(id, {
        actorId: currentUser?.id,
        actorName: currentUser?.name,
        reason: reason || actionNotes || 'Closed by operator'
      });
      setStagedMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'CLOSED', closed_at: new Date().toISOString() } : m));
      if (selectedStaged && selectedStaged.id === id) {
        setSelectedStaged((prev: any) => ({ ...prev, status: 'CLOSED', closed_at: new Date().toISOString() }));
      }
      setSuccessMsg('Request marked as CLOSED.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('Failed to close request in API:', err);
      setErrorMsg(`Failed to close request: ${err?.message || 'Server error'}`);
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleArchiveRequest = async (id: string) => {
    setIsProcessingAction(true);
    try {
      await api.archiveStagedMessage(id, {
        actorId: currentUser?.id,
        actorName: currentUser?.name
      });
      setStagedMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'ARCHIVED', archived_at: new Date().toISOString() } : m));
      if (selectedStaged && selectedStaged.id === id) {
        setSelectedStaged((prev: any) => ({ ...prev, status: 'ARCHIVED', archived_at: new Date().toISOString() }));
      }
      setSuccessMsg('Request ARCHIVED.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('Failed to archive request in API:', err);
      setErrorMsg(`Failed to archive request: ${err?.message || 'Server error'}`);
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleReopenRequest = async (id: string) => {
    setIsProcessingAction(true);
    try {
      await api.reopenStagedMessage(id, {
        actorId: currentUser?.id,
        actorName: currentUser?.name
      });
      setStagedMessages(prev => prev.map(m => m.id === id ? { ...m, status: 'NEW' } : m));
      if (selectedStaged && selectedStaged.id === id) {
        setSelectedStaged((prev: any) => ({ ...prev, status: 'NEW' }));
      }
      setSuccessMsg('Request REOPENED.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      console.error('Failed to reopen request in API:', err);
      setErrorMsg(`Failed to reopen request: ${err?.message || 'Server error'}`);
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleSimulateDispatch = async () => {
    if (!simSender.trim() || !simText.trim()) return;
    setSimRunning(true);
    try {
      if (teamId) {
        await api.dispatchSimulatedExternalRequest({
          teamId,
          channel: simChannel,
          senderAddress: simSender,
          rawBody: simText
        });
      }
      setSuccessMsg('Simulated external request dispatched and staged in intake queue.');
      // Prepend simulated item to UI
      const newItem = {
        id: `stg-sim-${Date.now().toString().slice(-4)}`,
        channel: simChannel,
        subject: simText.slice(0, 45) + '...',
        sender_name: simSender.split('@')[0].toUpperCase(),
        sender_address: simSender,
        category: 'Reconciliation exception',
        urgency: 'high',
        confidence_score: 0.85,
        attachments: [],
        status: 'NEW',
        created_at: new Date().toISOString(),
        raw_payload: JSON.stringify({ channel: simChannel, sender: simSender, message: simText }, null, 2),
        parsed_fields: { priority: 'High' }
      };
      setStagedMessages(prev => [newItem, ...prev]);
      setSummary((prev: any) => ({
        ...prev,
        totalInbound: (prev.totalInbound || 110) + 1,
        pendingTriage: (prev.pendingTriage || 60) + 1
      }));
    } catch (err: any) {
      setErrorMsg(err.message || 'Simulation dispatch failed');
    } finally {
      setSimRunning(false);
    }
  };

  return (
    <div className="h-full flex flex-col min-h-0 p-6 space-y-4 font-sans bg-[#F8FAFC]" id="intake-cockpit">
      {/* 1. Header matching 19_intake.png */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-heading text-slate-900 tracking-tight">Intake</h1>
          <p className="text-xs text-slate-500 mt-1 font-sans">
            Requests from email, webhooks and partner channels, triaged into cases.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            id="btn-intake-ftp-schedule"
            onClick={() => {
              if (ftpConfigs.length > 0) {
                handleOpenScheduleModal(ftpConfigs[0]);
              } else {
                setActiveSubTab('ftp_feeds');
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-medium font-sans transition-colors shadow-2xs cursor-pointer"
            title="Configure Automated FTP Staging Schedule"
          >
            <Clock size={13} className="text-[#F27421]" />
            <span>FTP Schedule</span>
            {ftpConfigs.some(c => c.scheduleConfig?.enabled) && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
            )}
          </button>

          <button
            type="button"
            id="btn-intake-initiate-intake"
            disabled={isInitiatingAll}
            onClick={handleInitiateAllFtp}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-[#0F142A] hover:bg-slate-800 text-white rounded-xl text-xs font-semibold font-sans transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
            title="Initiate immediate intake from connected FTP servers"
          >
            <Play size={13} className={isInitiatingAll ? 'animate-spin text-[#F27421]' : 'text-[#F27421] fill-[#F27421]'} />
            <span>{isInitiatingAll ? 'Initiating Intake...' : 'Initiate Intake'}</span>
          </button>

          <button
            onClick={loadAllData}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-medium font-sans transition-colors shadow-2xs cursor-pointer"
            title="Sync live intake telemetry"
          >
            <RefreshCw size={13} className={isLoading ? 'animate-spin text-[#F27421]' : 'text-slate-500'} />
            <span>Sync</span>
          </button>

          <button
            type="button"
            id="btn-intake-create-task"
            onClick={() => {
              if (onNavigateToCreateTask) {
                onNavigateToCreateTask();
              } else {
                setQuickTaskTitle('');
                setQuickTaskDesc('');
                setQuickTaskPriority('Medium');
                setQuickTaskModalOpen(true);
              }
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#F27421] hover:bg-[#e06516] text-white rounded-xl text-xs font-semibold font-sans transition-colors shadow-xs cursor-pointer"
          >
            <Plus size={14} />
            <span>Create task</span>
          </button>
        </div>
      </div>

      {/* 2. Dynamic KPI Summary Metrics Grid (Changes as the selected tab) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 shrink-0">
        {activeSubTab === 'created_tasks' ? (
          <>
            {/* Total Created Tasks */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Total Created Tasks</span>
              <p className="text-2xl font-bold font-heading text-slate-900">
                {taskMetrics.total}
              </p>
            </div>

            {/* Open Tasks */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Open Tasks</span>
              <p className="text-2xl font-bold font-heading text-rose-600">
                {taskMetrics.open}
              </p>
            </div>

            {/* Investigating */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Investigating</span>
              <p className="text-2xl font-bold font-heading text-amber-600">
                {taskMetrics.inProgress}
              </p>
            </div>

            {/* Resolved Cases */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Resolved Cases</span>
              <p className="text-2xl font-bold font-heading text-emerald-600">
                {taskMetrics.resolved}
              </p>
            </div>

            {/* High & Critical */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">High & Critical Priority</span>
              <p className="text-2xl font-bold font-heading text-rose-600">
                {taskMetrics.critical}
              </p>
            </div>

            {/* File Batches */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">File Ingestion Batches</span>
              <p className="text-2xl font-bold font-heading text-slate-900">
                {createdTasks.filter(t => t.type === 'file' || t.uploadedFileName).length}
              </p>
            </div>
          </>
        ) : activeSubTab === 'ftp_feeds' ? (
          <>
            {/* Configured Feeds */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Configured Feeds</span>
              <p className="text-2xl font-bold font-heading text-slate-900">
                {ftpConfigs.length}
              </p>
            </div>

            {/* Active Schedules */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Active Schedules</span>
              <p className="text-2xl font-bold font-heading text-emerald-600">
                {ftpConfigs.filter(c => c.scheduleConfig?.enabled).length}
              </p>
            </div>

            {/* Total Rows Staged */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Total Rows Staged</span>
              <p className="text-2xl font-bold font-heading text-[#F27421]">
                {ftpConfigs.reduce((acc, c) => acc + (c.lastStagedCount || 0), 0).toLocaleString()}
              </p>
            </div>

            {/* Active Servers */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Connected Servers</span>
              <p className="text-2xl font-bold font-heading text-slate-900">
                {new Set(ftpConfigs.map(c => c.ftpConnectionId).filter(Boolean)).size || 1}
              </p>
            </div>

            {/* Automated Engine */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Automated Engine</span>
              <p className="text-2xl font-bold font-heading text-emerald-600 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-lg">Online</span>
              </p>
            </div>

            {/* Polling Mode */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Polling Frequency</span>
              <p className="text-lg font-bold font-heading text-slate-900 pt-1">
                Scheduled
              </p>
            </div>
          </>
        ) : activeSubTab === 'providers' ? (
          <>
            {/* Connected Providers */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Connected Providers</span>
              <p className="text-2xl font-bold font-heading text-slate-900">
                {providers.length || 7}
              </p>
            </div>

            {/* OAuth 2.0 Engines */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">OAuth 2.0 Auth</span>
              <p className="text-2xl font-bold font-heading text-emerald-600">
                Enterprise
              </p>
            </div>

            {/* Channel Diversity */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Channel Diversity</span>
              <p className="text-2xl font-bold font-heading text-[#F27421]">
                4 Channels
              </p>
            </div>

            {/* Discovered Feeds */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Ingestion Ingress</span>
              <p className="text-2xl font-bold font-heading text-slate-900">
                Active
              </p>
            </div>

            {/* Handshake Integrity */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Handshake Integrity</span>
              <p className="text-2xl font-bold font-heading text-emerald-600">
                Encrypted
              </p>
            </div>

            {/* Telemetry Bridge */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Telemetry Bridge</span>
              <p className="text-2xl font-bold font-heading text-emerald-600 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-lg">Healthy</span>
              </p>
            </div>
          </>
        ) : activeSubTab === 'webhooks' ? (
          <>
            {/* Configured Endpoints */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Configured Endpoints</span>
              <p className="text-2xl font-bold font-heading text-slate-900">
                {configs.length || 3}
              </p>
            </div>

            {/* Ingress Protocol */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Ingress Protocol</span>
              <p className="text-2xl font-bold font-heading text-slate-900">
                HTTPS / POST
              </p>
            </div>

            {/* Signature Auth */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Signature Auth</span>
              <p className="text-2xl font-bold font-heading text-[#F27421]">
                HMAC-SHA256
              </p>
            </div>

            {/* Success Rate */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Success Rate</span>
              <p className="text-2xl font-bold font-heading text-emerald-600">
                100%
              </p>
            </div>

            {/* Retry Policy */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Retry Policy</span>
              <p className="text-2xl font-bold font-heading text-slate-900">
                Exponential
              </p>
            </div>

            {/* Listener Status */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Listener Status</span>
              <p className="text-2xl font-bold font-heading text-emerald-600 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-lg">Listening</span>
              </p>
            </div>
          </>
        ) : activeSubTab === 'simulator' ? (
          <>
            {/* Selected Channel */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Selected Channel</span>
              <p className="text-2xl font-bold font-heading text-slate-900 uppercase">
                {simChannel}
              </p>
            </div>

            {/* Anomaly Engine */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Anomaly Engine</span>
              <p className="text-2xl font-bold font-heading text-emerald-600">
                Active
              </p>
            </div>

            {/* Confidence Target */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Confidence Target</span>
              <p className="text-2xl font-bold font-heading text-[#F27421]">
                80% - 95%
              </p>
            </div>

            {/* Staging Target */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Staging Target</span>
              <p className="text-2xl font-bold font-heading text-slate-900">
                Queue Sandbox
              </p>
            </div>

            {/* Dispatched Tests */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Simulated Runs</span>
              <p className="text-2xl font-bold font-heading text-purple-600">
                {stagedMessages.filter(m => m.id?.startsWith('stg-sim')).length}
              </p>
            </div>

            {/* Engine Status */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Simulator Engine</span>
              <p className="text-2xl font-bold font-heading text-emerald-600 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-lg">{simRunning ? 'Dispatching...' : 'Ready'}</span>
              </p>
            </div>
          </>
        ) : (
          /* Default: Requests Tab KPIs */
          <>
            {/* Total Inbound */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Total Inbound</span>
              <p className="text-2xl font-bold font-heading text-slate-900">
                {summary.totalInbound || 110}
              </p>
            </div>

            {/* Pending triage */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Pending triage</span>
              <p className="text-2xl font-bold font-heading text-slate-900">
                {summary.pendingTriage || 60}
              </p>
            </div>

            {/* Ready for task (Orange) */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Ready for task</span>
              <p className="text-2xl font-bold font-heading text-[#F27421]">
                {summary.readyForTaskCreation || 41}
              </p>
            </div>

            {/* Converted (Emerald) */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Converted</span>
              <p className="text-2xl font-bold font-heading text-emerald-600">
                {summary.convertedToTask || 9}
              </p>
            </div>

            {/* Escalated */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Escalated</span>
              <p className="text-2xl font-bold font-heading text-slate-900">
                {summary.escalatedCount || 0}
              </p>
            </div>

            {/* SLA breaches (Rose) */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">SLA breaches</span>
              <p className="text-2xl font-bold font-heading text-rose-600">
                {summary.slaBreachCount || 101}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-500 hover:text-rose-700 cursor-pointer"><X size={14} /></button>
        </div>
      )}

      {successMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700 cursor-pointer"><X size={14} /></button>
        </div>
      )}

      {/* 3. Sub-Navigation Tabs matching 19_intake.png */}
      <div className="flex items-center space-x-1 border-b border-slate-200/80 pb-2 font-sans">
        <button
          type="button"
          id="tab-intake-created-tasks"
          onClick={() => setActiveSubTab('created_tasks')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === 'created_tasks'
              ? 'bg-[#0F142A] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Briefcase size={13} className={activeSubTab === 'created_tasks' ? 'text-[#F27421]' : 'text-slate-500'} />
          <span>Created Tasks</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-sans ${
            activeSubTab === 'created_tasks' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {createdTasks.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('requests')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === 'requests'
              ? 'bg-[#0F142A] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>Requests</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-sans ${
            activeSubTab === 'requests' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {stagedMessages.length > 50 ? stagedMessages.length : 100}
          </span>
        </button>

        <button
          type="button"
          id="tab-intake-ftp-feeds"
          onClick={() => setActiveSubTab('ftp_feeds')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === 'ftp_feeds'
              ? 'bg-[#0F142A] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Server size={13} className={activeSubTab === 'ftp_feeds' ? 'text-[#F27421]' : 'text-slate-500'} />
          <span>FTP Feeds</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-sans ${
            activeSubTab === 'ftp_feeds' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {ftpConfigs.length}
          </span>
          {ftpConfigs.some(c => c.scheduleConfig?.enabled) && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('providers')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === 'providers'
              ? 'bg-[#0F142A] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>Providers</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-sans ${
            activeSubTab === 'providers' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {providers.length || 7}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('webhooks')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === 'webhooks'
              ? 'bg-[#0F142A] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>Webhooks</span>
          <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-sans ${
            activeSubTab === 'webhooks' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
          }`}>
            {configs.length || 3}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('simulator')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
            activeSubTab === 'simulator'
              ? 'bg-[#0F142A] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <span>Simulator</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* 4. TAB 1: REQUESTS QUEUE & TABLE                          */}
      {/* ========================================================= */}
      {activeSubTab === 'requests' && (
        <div className="flex-1 min-h-0 space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search sender, subject or case reference..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-80 bg-white border border-slate-200 rounded-lg px-3 py-1.5 pl-8 text-xs text-slate-700 placeholder-slate-400 font-sans shadow-2xs focus:outline-none focus:border-[#F27421]"
              />
            </div>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-sans text-slate-700 shadow-2xs focus:outline-none focus:border-[#F27421] cursor-pointer"
            >
              <option value="ALL">All statuses</option>
              <option value="NEW">New</option>
              <option value="READY_FOR_TASK_CREATION">Ready for task</option>
              <option value="CONVERTED_TO_TASK">Converted to task</option>
              <option value="CLOSED">Closed</option>
              <option value="ARCHIVED">Archived</option>
              <option value="ESCALATED">Escalated</option>
              <option value="REJECTED">Rejected</option>
            </select>

            <select
              value={urgencyFilter}
              onChange={e => setUrgencyFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-sans text-slate-700 shadow-2xs focus:outline-none focus:border-[#F27421] cursor-pointer"
            >
              <option value="ALL">All urgencies</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>

          {/* Table Container */}
          <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="sticky top-0 z-10 bg-white border-b border-slate-100 text-slate-400 font-sans text-xs">
                    <th className="py-3 px-4 font-normal">Request</th>
                    <th className="py-3 px-4 font-normal">Category</th>
                    <th className="py-3 px-4 font-normal">Urgency</th>
                    <th className="py-3 px-4 font-normal">Attachments</th>
                    <th className="py-3 px-4 font-normal">Status</th>
                    <th className="py-3 px-4 font-normal text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {paginatedMessages.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 font-sans">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <Mail size={24} className="text-slate-300" />
                          <p className="font-medium text-slate-600">No requests match the selected criteria</p>
                          <p className="text-xs text-slate-400">Try adjusting your filters or search keywords</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedMessages.map(msg => {
                      const atts = msg.attachments || [];

                      return (
                        <tr key={msg.id} className="hover:bg-slate-50/70 transition">
                          {/* Request Column */}
                          <td className="py-3.5 px-4 max-w-sm">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                                <Mail size={15} />
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 font-sans truncate">
                                  {msg.subject || 'External Service Request'}
                                </div>
                                <div className="text-slate-400 text-xs truncate mt-0.5 font-sans">
                                  {msg.sender_name || msg.senderAddress || 'Partner Bank Operator'}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Category */}
                          <td className="py-3.5 px-4 text-slate-700 font-sans">
                            {msg.category || 'Reconciliation exception'}
                          </td>

                          {/* Urgency */}
                          <td className="py-3.5 px-4">
                            <span className={`px-2.5 py-0.5 rounded text-xs font-medium font-sans ${
                              msg.urgency === 'critical'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200/60'
                                : msg.urgency === 'high'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200/60'
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {msg.urgency === 'critical' ? 'Critical' : msg.urgency === 'high' ? 'High' : 'Normal'}
                            </span>
                          </td>

                          {/* Attachments */}
                          <td className="py-3.5 px-4 text-slate-600 font-sans">
                            {atts.length > 0 ? (
                              `${atts.length} ${atts.length === 1 ? 'file' : 'files'}`
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4">
                            {msg.status === 'READY_FOR_TASK_CREATION' ? (
                              <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200/60">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                <span>Ready for task</span>
                              </span>
                            ) : msg.status === 'CONVERTED_TO_TASK' ? (
                              <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                <span>Converted</span>
                              </span>
                            ) : msg.status === 'CLOSED' ? (
                              <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-300">
                                <CheckCircle2 size={11} className="text-slate-500" />
                                <span>Closed</span>
                              </span>
                            ) : msg.status === 'ARCHIVED' ? (
                              <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 text-zinc-600 border border-zinc-200">
                                <Archive size={11} className="text-zinc-500" />
                                <span>Archived</span>
                              </span>
                            ) : msg.status === 'ESCALATED' ? (
                              <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200/60">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                <span>Escalated</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                                <span>New</span>
                              </span>
                            )}
                          </td>

                          {/* Review Action */}
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => handleOpenReview(msg)}
                              className="px-3 py-1.5 bg-white hover:bg-[#F27421]/10 text-slate-700 hover:text-[#F27421] border border-slate-200 hover:border-[#F27421]/40 rounded-lg text-xs font-semibold font-sans shadow-2xs transition-all cursor-pointer inline-flex items-center gap-1.5"
                              title="Review request details and create task per attached file"
                            >
                              <Eye size={13} />
                              <span>Review</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Requests Table Pagination Footer */}
            <DataTablePagination
              currentPage={requestPage}
              totalItems={filteredMessages.length}
              pageSize={requestPageSize}
              pageSizeOptions={[5, 6, 7, 8, 10, 15, 20, 25, 50]}
              onPageChange={setRequestPage}
              onPageSizeChange={(newSize) => {
                setRequestPageSize(newSize);
                setRequestPage(1);
              }}
              statusBadge={
                <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200/60">
                  {filteredMessages.length} filtered · {stagedMessages.length} total
                </span>
              }
            />
          </div>

        </div>
      )}

      {/* ========================================================= */}
      {/* TAB: FTP FEEDS & SCHEDULE MANAGEMENT                      */}
      {/* ========================================================= */}
      {activeSubTab === 'ftp_feeds' && (
        <div className="flex-1 min-h-0 flex flex-col space-y-4">
          {/* Action & Filter Toolbar */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filter feeds by name, pattern, or table..."
                  value={ftpSearchQuery}
                  onChange={e => setFtpSearchQuery(e.target.value)}
                  className="w-72 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 pl-8 text-xs text-slate-700 placeholder-slate-400 font-sans focus:outline-none focus:border-[#F27421] focus:bg-white"
                />
              </div>

              <span className="text-xs text-slate-500 font-sans">
                Showing {filteredFtpConfigs.length} of {ftpConfigs.length} clearing feeds
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadAllData}
                disabled={isLoading}
                className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium font-sans transition cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw size={12} className={isLoading ? 'animate-spin text-[#F27421]' : 'text-slate-500'} />
                <span>Refresh Feeds</span>
              </button>

              <button
                type="button"
                disabled={isInitiatingAll}
                onClick={handleInitiateAllFtp}
                className="px-3.5 py-1.5 bg-[#0F142A] hover:bg-slate-800 text-white rounded-lg text-xs font-semibold font-sans transition cursor-pointer flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
              >
                <Play size={12} className={isInitiatingAll ? 'animate-spin text-[#F27421]' : 'text-[#F27421] fill-[#F27421]'} />
                <span>{isInitiatingAll ? 'Initiating All Feeds...' : 'Initiate Intake (All Feeds)'}</span>
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs overflow-hidden flex-1 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="sticky top-0 z-10 bg-white border-b border-slate-100 text-slate-400 font-sans text-xs">
                    <th className="py-3 px-4 font-normal">Feed & Endpoint</th>
                    <th className="py-3 px-4 font-normal">Pattern & Mirror Table</th>
                    <th className="py-3 px-4 font-normal">Format</th>
                    <th className="py-3 px-4 font-normal">Schedule & Frequency</th>
                    <th className="py-3 px-4 font-normal">Deduplication</th>
                    <th className="py-3 px-4 font-normal">Telemetry</th>
                    <th className="py-3 px-4 font-normal text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {paginatedFtpConfigs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-sans">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <Server size={24} className="text-slate-300" />
                          <p className="font-medium text-slate-600">No FTP feeds match the search criteria</p>
                          <p className="text-xs text-slate-400">Try adjusting your filter keyword</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedFtpConfigs.map(config => {
                      const isSchedActive = config.scheduleConfig?.enabled !== false;
                      const isProcessingThis = !!isInitiatingIntake[config.id];

                      return (
                        <tr key={config.id} className="hover:bg-slate-50/70 transition">
                          {/* 1. Feed & Endpoint */}
                          <td className="py-3.5 px-4 max-w-xs">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-200/60 flex items-center justify-center text-[#F27421] shrink-0">
                                <Server size={15} />
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 font-sans truncate" title={config.name}>
                                  {config.name}
                                </div>
                                <div className="text-slate-400 text-xs truncate mt-0.5 font-mono flex items-center gap-1.5">
                                  <span className="truncate" title={config.ftpConnectionId}>{config.ftpConnectionId}</span>
                                  <span>•</span>
                                  <span className="text-slate-500">{config.folderTraversalMode || 'RECURSIVE'}</span>
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* 2. Pattern & Mirror Table */}
                          <td className="py-3.5 px-4">
                            <div className="space-y-1">
                              <div className="font-mono text-xs font-semibold text-slate-800 truncate max-w-xs" title={config.fileNamePattern}>
                                {config.fileNamePattern}
                              </div>
                              <div className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60 truncate max-w-xs" title={config.stagingTableName || 'mirror_ftp_*'}>
                                <Database size={10} className="shrink-0 text-emerald-600" />
                                <span className="truncate">{config.stagingTableName || 'mirror_ftp_*'}</span>
                              </div>
                            </div>
                          </td>

                          {/* 3. Format */}
                          <td className="py-3.5 px-4">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                              (config.fileFormat || 'EXCEL').toUpperCase() === 'EXCEL'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : (config.fileFormat || '').toUpperCase() === 'CSV'
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : 'bg-purple-50 text-purple-700 border-purple-200'
                            }`}>
                              {config.fileFormat || 'EXCEL'}
                            </span>
                          </td>

                          {/* 4. Schedule & Frequency */}
                          <td className="py-3.5 px-4">
                            <div className="space-y-1">
                              <div>
                                {isSchedActive ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span>Active</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                                    <span>Paused</span>
                                  </span>
                                )}
                              </div>
                              <div className="text-slate-700 text-xs font-medium flex items-center gap-1">
                                <Clock size={11} className="text-[#F27421] shrink-0" />
                                <span>
                                  {config.scheduleConfig?.frequency === 'DAILY'
                                    ? `Daily at ${config.scheduleConfig?.scheduledTime || '02:00'} UTC`
                                    : config.scheduleConfig?.frequency === 'HOURLY'
                                    ? 'Hourly Polling (60m)'
                                    : config.scheduleConfig?.frequency === 'EVERY_15_MIN'
                                    ? 'Intraday (15m)'
                                    : config.scheduleConfig?.frequency === 'CUSTOM_CRON'
                                    ? `Cron: ${config.scheduleConfig?.scheduleCron || '0 2 * * *'}`
                                    : 'Manual / On-Demand'}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* 5. Deduplication Policy */}
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center gap-1 text-slate-600 text-xs font-medium">
                              <Shield size={12} className="text-slate-400 shrink-0" />
                              <span>
                                {config.scheduleConfig?.deduplicationPolicy === 'UPDATE'
                                  ? 'Re-parse & Overwrite'
                                  : 'Skip Duplicates (Ledger)'}
                              </span>
                            </span>
                          </td>

                          {/* 6. Telemetry */}
                          <td className="py-3.5 px-4">
                            <div>
                              <span className="font-semibold text-slate-800">
                                {config.lastStagedCount !== undefined
                                  ? `${config.lastStagedCount.toLocaleString()} rows`
                                  : '0 rows'}
                              </span>
                              {config.lastStagedAt && (
                                <div className="text-slate-400 text-[11px] mt-0.5 font-sans">
                                  {new Date(config.lastStagedAt).toLocaleDateString()}
                                </div>
                              )}
                            </div>
                          </td>

                          {/* 7. Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleResetLedger(config)}
                                className="px-2 py-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg text-xs font-medium font-sans transition cursor-pointer flex items-center gap-1"
                                title="Reset ingested files ledger so remote files can be re-staged"
                              >
                                <RotateCcw size={12} />
                                <span className="hidden sm:inline">Reset</span>
                              </button>

                              <button
                                type="button"
                                id={`btn-configure-schedule-${config.id}`}
                                onClick={() => handleOpenScheduleModal(config)}
                                className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-semibold font-sans transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                                title="Configure Ingestion Schedule & Triggers"
                              >
                                <Clock size={12} className="text-[#F27421]" />
                                <span>Schedule</span>
                              </button>

                              <button
                                type="button"
                                id={`btn-initiate-intake-${config.id}`}
                                disabled={isProcessingThis}
                                onClick={() => handleInitiateSingleFtp(config)}
                                className="px-3 py-1 bg-[#F27421] hover:bg-[#e06516] text-white rounded-lg text-xs font-semibold font-sans transition cursor-pointer flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                                title="Initiate Immediate Ingestion for this feed"
                              >
                                <Play size={11} className={isProcessingThis ? 'animate-spin' : 'fill-white'} />
                                <span>{isProcessingThis ? 'Ingesting...' : 'Initiate Intake'}</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <DataTablePagination
              currentPage={ftpPage}
              totalItems={filteredFtpConfigs.length}
              pageSize={ftpPageSize}
              pageSizeOptions={[5, 7, 8, 10, 15, 20]}
              onPageChange={setFtpPage}
              onPageSizeChange={(newSize) => {
                setFtpPageSize(newSize);
                setFtpPage(1);
              }}
              statusBadge={
                <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200/60">
                  {filteredFtpConfigs.length} filtered · {ftpConfigs.length} total feeds
                </span>
              }
            />
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB: CREATED TASKS & CASES                                */}
      {/* ========================================================= */}
      {activeSubTab === 'created_tasks' && (
        <div className="flex-1 min-h-0 flex flex-col space-y-4">
          {/* Action & Filter Toolbar */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by case ID, title, creator, or #hashtag..."
                  value={taskSearchQuery}
                  onChange={e => {
                    setTaskSearchQuery(e.target.value);
                    setTaskPage(1);
                  }}
                  className="w-72 sm:w-80 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 pl-8 text-xs text-slate-700 placeholder-slate-400 font-sans focus:outline-none focus:border-[#F27421] focus:bg-white"
                />
              </div>

              <select
                value={taskStatusFilter}
                onChange={e => {
                  setTaskStatusFilter(e.target.value);
                  setTaskPage(1);
                }}
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-sans text-slate-700 shadow-2xs focus:outline-none focus:border-[#F27421] cursor-pointer"
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">Open</option>
                <option value="INVESTIGATING">Investigating</option>
                <option value="RESOLVED">Resolved</option>
                <option value="FLAGGED">Flagged</option>
              </select>

              <select
                value={taskPriorityFilter}
                onChange={e => {
                  setTaskPriorityFilter(e.target.value);
                  setTaskPage(1);
                }}
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-sans text-slate-700 shadow-2xs focus:outline-none focus:border-[#F27421] cursor-pointer"
              >
                <option value="ALL">All Priorities</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>

              <span className="text-xs text-slate-500 font-sans">
                Showing {filteredTasks.length} of {createdTasks.length} tasks
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadAllData}
                disabled={isLoading}
                className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium font-sans transition cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw size={12} className={isLoading ? 'animate-spin text-[#F27421]' : 'text-slate-500'} />
                <span>Refresh</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onNavigateToCreateTask) {
                    onNavigateToCreateTask();
                  } else {
                    setQuickTaskTitle('');
                    setQuickTaskDesc('');
                    setQuickTaskPriority('Medium');
                    setQuickTaskModalOpen(true);
                  }
                }}
                className="px-3 py-1.5 bg-[#F27421] hover:bg-[#e06516] text-white rounded-lg text-xs font-semibold font-sans shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Plus size={13} />
                <span>New Task</span>
              </button>
            </div>
          </div>

          {/* Tasks Table */}
          <div className="bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-2xs flex-1 min-h-0 flex flex-col">
            <div className="overflow-x-auto flex-1 min-h-0">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-semibold text-slate-500 tracking-wider uppercase font-sans">
                    <th className="py-3 px-4">Task / Case ID</th>
                    <th className="py-3 px-4">Title & Details</th>
                    <th className="py-3 px-4">Source Dataset</th>
                    <th className="py-3 px-4">Records</th>
                    <th className="py-3 px-4">Priority</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Created By</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-sans">
                  {paginatedTasks.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <Briefcase size={32} className="mx-auto mb-2 text-slate-300" />
                        <p className="font-medium text-slate-600">No created tasks found</p>
                        <p className="text-[11px] text-slate-400 mt-1">Tasks created from intake requests or files will appear here.</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedTasks.map((task) => (
                      <tr key={task.id} className="hover:bg-slate-50/60 transition-colors">
                        {/* Task / Case ID */}
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onNavigateToCase?.(task.id)}
                            className="text-slate-900 hover:text-[#F27421] transition-colors cursor-pointer text-left flex items-center gap-1.5 group"
                            title="Open case in workspace"
                          >
                            <span>{task.id}</span>
                            <ExternalLink size={11} className="text-slate-400 group-hover:text-[#F27421] opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                          <div className="text-[10px] font-sans font-normal text-slate-400 mt-0.5">
                            {task.type === 'file' ? 'File Batch' : 'Single Ingestion'}
                          </div>
                        </td>

                        {/* Title & Details */}
                        <td className="py-3.5 px-4 max-w-xs">
                          <div
                            onClick={() => onNavigateToCase?.(task.id)}
                            className="font-semibold text-slate-800 hover:text-[#F27421] transition-colors cursor-pointer truncate"
                            title={task.title}
                          >
                            {task.title}
                          </div>
                          {task.description && (
                            <div className="text-[11px] text-slate-400 truncate mt-0.5">
                              {task.description}
                            </div>
                          )}
                          {task.linkedHashtag && (
                            <div className="mt-1">
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                <Hash size={10} className="text-slate-400" />
                                <span>{task.linkedHashtag.replace(/^#/, '')}</span>
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Source Dataset */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {task.uploadedFileName ? (
                            <div className="flex items-center gap-1.5 text-slate-700">
                              <FileText size={13} className="text-blue-500 shrink-0" />
                              <span className="font-mono text-[11px] truncate max-w-[140px]" title={task.uploadedFileName}>
                                {task.uploadedFileName}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">Direct Ingestion</span>
                          )}
                        </td>

                        {/* Records */}
                        <td className="py-3.5 px-4 font-mono text-slate-700 whitespace-nowrap">
                          {(task.transactionCount ?? task.firstLevelMappedData?.length ?? 0).toLocaleString()}
                        </td>

                        {/* Priority */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${getPriorityClass(task.priority)}`}>
                            {task.priority || 'Medium'}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusClass(task.status)}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${getStatusDot(task.status)}`} />
                            <span>{task.status || 'Open'}</span>
                          </span>
                        </td>

                        {/* Created By */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="text-slate-700 font-medium text-xs">
                            @{task.creatorName || 'admin'}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {formatTaskDate(task.createdAt)}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            id={`btn-open-case-${task.id}`}
                            onClick={() => onNavigateToCase?.(task.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F27421] hover:bg-[#e06516] text-white rounded-lg text-xs font-semibold font-sans shadow-2xs transition-colors cursor-pointer"
                            title={`Open case ${task.id} in Cases workspace`}
                          >
                            <span>Open case</span>
                            <ArrowUpRight size={13} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <DataTablePagination
              currentPage={taskPage}
              totalItems={filteredTasks.length}
              pageSize={taskPageSize}
              pageSizeOptions={[5, 7, 10, 15, 20, 25, 50]}
              onPageChange={setTaskPage}
              onPageSizeChange={(newSize) => {
                setTaskPageSize(newSize);
                setTaskPage(1);
              }}
              statusBadge={
                <span className="text-[11px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200/60">
                  {filteredTasks.length} filtered · {createdTasks.length} total
                </span>
              }
            />
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. TAB 2: PROVIDERS                                       */}
      {/* ========================================================= */}
      {activeSubTab === 'providers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 font-heading">Provider Connections</h3>
              <p className="text-xs text-slate-500 font-sans mt-0.5">
                Centralized OAuth 2.0 and enterprise connectors to ingest emails and partner feeds.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-200/80 p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                  MICROSOFT 365
                </span>
                <span className="text-xs text-emerald-600 font-medium">● Active</span>
              </div>
              <h4 className="font-bold text-xs text-slate-900">Exchange Settlement Ingress</h4>
              <p className="text-xs text-slate-500">
                Polls clearing batches sent to settlement@ethiopay.et every 5 minutes.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/80 p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  ZOHO MAIL
                </span>
                <span className="text-xs text-emerald-600 font-medium">● Active</span>
              </div>
              <h4 className="font-bold text-xs text-slate-900">Dispute Desk Mailbox</h4>
              <p className="text-xs text-slate-500">
                Direct OAuth 2.0 mailbox intake for customer chargeback requests.
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200/80 p-4 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  SFTP STAGING
                </span>
                <span className="text-xs text-emerald-600 font-medium">
                  ● {ftpConfigs.filter(c => c.scheduleConfig?.enabled).length > 0 ? 'Active' : 'Connected'}
                </span>
              </div>
              <h4 className="font-bold text-xs text-slate-900">National Switch FTP Batch</h4>
              <p className="text-xs text-slate-500">
                Auto-ingests .xlsx and .csv settlement reports from secure bank FTP servers.
              </p>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setActiveSubTab('ftp_feeds')}
                  className="px-2.5 py-1 text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold transition cursor-pointer"
                >
                  View Feeds ({ftpConfigs.length})
                </button>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (ftpConfigs.length > 0) handleOpenScheduleModal(ftpConfigs[0]);
                      else setActiveSubTab('ftp_feeds');
                    }}
                    className="px-2.5 py-1 text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                  >
                    <Clock size={11} className="text-[#F27421]" />
                    <span>Schedule</span>
                  </button>
                  <button
                    type="button"
                    disabled={isInitiatingAll}
                    onClick={handleInitiateAllFtp}
                    className="px-2.5 py-1 bg-[#F27421] hover:bg-[#e06516] text-white rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                  >
                    <Play size={11} className="fill-white" />
                    <span>Intake</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 6. TAB 3: WEBHOOKS                                        */}
      {/* ========================================================= */}
      {activeSubTab === 'webhooks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 font-heading">Webhook Endpoints</h3>
              <p className="text-xs text-slate-500 font-sans mt-0.5">
                Authorized webhook callback URLs for instant notification triage.
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="font-bold text-xs text-slate-900 font-sans">Payment Switch ISO-8583 Alert Webhook</p>
                <p className="text-xs text-slate-400 font-mono mt-0.5">https://api.ethiopay.et/api/webhooks/switch-alerts</p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                Verified
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="font-bold text-xs text-slate-900 font-sans">Core Banking Discrepancy Listener</p>
                <p className="text-xs text-slate-400 font-mono mt-0.5">https://api.ethiopay.et/api/webhooks/core-banking</p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                Verified
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 7. TAB 4: SIMULATOR                                       */}
      {/* ========================================================= */}
      {activeSubTab === 'simulator' && (
        <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-2xs space-y-4 max-w-2xl">
          <div>
            <h3 className="text-base font-bold text-slate-900 font-heading">Intake Simulator Console</h3>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              Dispatch simulated partner inquiries or settlement notifications into the triage pipeline.
            </p>
          </div>

          <div className="space-y-3 font-sans">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Channel</label>
              <select
                value={simChannel}
                onChange={e => setSimChannel(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800"
              >
                <option value="email">Email (SMTP / Exchange)</option>
                <option value="teams">Microsoft Teams Webhook</option>
                <option value="whatsapp">WhatsApp Business API</option>
                <option value="telegram">Telegram Bot Notification</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Sender Address / Phone</label>
              <input
                type="text"
                value={simSender}
                onChange={e => setSimSender(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">Message Content &amp; Settlement Anomaly Payload</label>
              <textarea
                rows={4}
                value={simText}
                onChange={e => setSimText(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-800 font-sans"
              />
            </div>

            <button
              onClick={handleSimulateDispatch}
              disabled={simRunning}
              className="px-4 py-2 bg-[#F27421] hover:bg-[#e06516] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <Play size={13} />
              <span>{simRunning ? 'Dispatching...' : 'Dispatch Simulated Intake Request'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 8. REVIEW DRAWER (SLIDE-IN)                               */}
      {/* ========================================================= */}
      {reviewDrawerOpen && selectedStaged && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs" onClick={() => setReviewDrawerOpen(false)} />
          <aside className="relative w-full max-w-md bg-white shadow-2xl z-10 flex flex-col justify-between border-l border-slate-200 animate-in slide-in-from-right duration-200 font-sans">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-start justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium block mb-1">
                  Intake Request Review
                </span>
                <h2 className="text-lg font-bold text-slate-900 font-sans">
                  {selectedStaged.subject || 'External Request'}
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  From: {selectedStaged.sender_name || selectedStaged.sender_address}
                </p>
              </div>

              <button
                onClick={() => setReviewDrawerOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
              {/* Triage Status & Operational Actions */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Triage:</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      selectedStaged.status === 'CLOSED' ? 'bg-slate-200 text-slate-700' :
                      selectedStaged.status === 'ARCHIVED' ? 'bg-zinc-200 text-zinc-700' :
                      selectedStaged.status === 'CONVERTED_TO_TASK' ? 'bg-emerald-100 text-emerald-800' :
                      selectedStaged.status === 'READY_FOR_TASK_CREATION' ? 'bg-amber-100 text-amber-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {selectedStaged.status || 'NEW'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    {selectedStaged.status !== 'CLOSED' && (
                      <button
                        type="button"
                        onClick={() => handleCloseRequest(selectedStaged.id)}
                        disabled={isProcessingAction}
                        className="px-2.5 py-1 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1 shadow-2xs"
                        title="Close this intake request"
                      >
                        <CheckCircle2 size={12} />
                        <span>Close</span>
                      </button>
                    )}
                    {selectedStaged.status !== 'ARCHIVED' && (
                      <button
                        type="button"
                        onClick={() => handleArchiveRequest(selectedStaged.id)}
                        disabled={isProcessingAction}
                        className="px-2.5 py-1 bg-white hover:bg-zinc-100 text-slate-600 hover:text-zinc-900 border border-slate-200 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1 shadow-2xs"
                        title="Archive this request"
                      >
                        <Archive size={12} />
                        <span>Archive</span>
                      </button>
                    )}
                    {(selectedStaged.status === 'CLOSED' || selectedStaged.status === 'ARCHIVED') && (
                      <button
                        type="button"
                        onClick={() => handleReopenRequest(selectedStaged.id)}
                        disabled={isProcessingAction}
                        className="px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 rounded-lg text-xs font-medium transition cursor-pointer flex items-center gap-1 shadow-2xs"
                        title="Reopen request"
                      >
                        <RotateCcw size={12} />
                        <span>Reopen</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Category &amp; Urgency</label>
                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 font-medium">
                    {selectedStaged.category || 'Reconciliation exception'}
                  </span>
                  <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-700 font-medium">
                    {selectedStaged.urgency || 'Normal'}
                  </span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-800">
                    Attached Files ({selectedStaged.attachments?.length || 0})
                  </label>
                  {selectedStaged.attachments && selectedStaged.attachments.length > 0 && (
                    <span className="text-[11px] text-[#F27421] font-medium">
                      Per-file task status
                    </span>
                  )}
                </div>

                {selectedStaged.attachments && selectedStaged.attachments.length > 0 ? (
                  <div className="space-y-2">
                    {selectedStaged.attachments.map((att: any, i: number) => {
                      const isExcel = att.filename?.endsWith('.xlsx') || att.filename?.endsWith('.xls');
                      const isCsv = att.filename?.endsWith('.csv');
                      const linkedCaseId = att.createdIssueId || att.created_issue_id;

                      return (
                        <div
                          key={att.id || i}
                          className="p-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl transition-all flex items-center justify-between gap-3 shadow-2xs"
                        >
                          <div className="flex items-center space-x-2.5 min-w-0">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              isExcel || isCsv ? 'bg-emerald-50 text-emerald-600' : 'bg-[#F27421]/10 text-[#F27421]'
                            }`}>
                              {isExcel || isCsv ? <FileSpreadsheet size={16} /> : <FileText size={16} />}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-800 text-xs truncate" title={att.filename}>
                                {att.filename || `attachment_${i + 1}.xlsx`}
                              </p>
                              <div className="flex items-center space-x-2 mt-0.5 text-[11px] text-slate-400">
                                <span>{att.size || (isExcel ? 'Excel Spreadsheet' : isCsv ? 'CSV Dataset' : 'Document')}</span>
                                {att.filename && (
                                  <span className="uppercase font-mono text-[9px] px-1 py-0.2 bg-slate-200/80 text-slate-600 rounded">
                                    {att.filename.split('.').pop()}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {linkedCaseId ? (
                            <div className="flex items-center space-x-2 shrink-0">
                              <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold">
                                Case #{linkedCaseId}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setReviewDrawerOpen(false);
                                  if (onNavigateToCase) {
                                    onNavigateToCase(linkedCaseId);
                                  }
                                }}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold font-sans transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                                title={`Open Case ${linkedCaseId}`}
                              >
                                <ArrowUpRight size={13} />
                                <span>Open case ↗</span>
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleCreateTaskForAttachment(att, selectedStaged)}
                              className="px-3 py-1.5 bg-[#F27421] hover:bg-[#e06516] text-white rounded-lg text-xs font-semibold font-sans transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs shrink-0"
                              title={`Create task for ${att.filename}`}
                            >
                              <Plus size={13} />
                              <span>Create Task</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400">
                    No files attached to this request (text/payload only).
                  </div>
                )}
              </div>

              {/* Channel / Email Quick Reply Section */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Mail size={14} className="text-[#F27421]" />
                    <label className="text-xs font-bold text-slate-800">
                      Respond to Request
                    </label>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    via {selectedStaged.channel ? String(selectedStaged.channel).toUpperCase() : 'EMAIL'}
                  </span>
                </div>

                <div className="text-[11px] text-slate-600 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/80 truncate">
                  <span className="font-semibold text-slate-700">To:</span> {selectedStaged.sender_name || selectedStaged.senderName || ''} &lt;{selectedStaged.sender_address || selectedStaged.senderAddress || ''}&gt;
                </div>

                {/* Quick Reply Template Chips */}
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setReplyText(`Hello ${selectedStaged.sender_name || selectedStaged.senderName || ''},\n\nWe acknowledge receipt of your settlement feed and our operations team has queued it for reconciliation.\n\nBest regards,\nEthioPay Operations`)}
                    className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-md text-[10px] font-medium transition cursor-pointer"
                  >
                    + Acknowledge receipt
                  </button>
                  <button
                    type="button"
                    onClick={() => setReplyText(`Hello ${selectedStaged.sender_name || selectedStaged.senderName || ''},\n\nAn operational reconciliation case has been created for your attached feed. We will notify you once verification is completed.\n\nBest regards,\nEthioPay Operations`)}
                    className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-md text-[10px] font-medium transition cursor-pointer"
                  >
                    + Case created
                  </button>
                  <button
                    type="button"
                    onClick={() => setReplyText(`Hello ${selectedStaged.sender_name || selectedStaged.senderName || ''},\n\nWe noticed an anomaly in the records. Could you please provide the switch clearing log for this cycle?\n\nBest regards,\nEthioPay Operations`)}
                    className="px-2 py-0.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-md text-[10px] font-medium transition cursor-pointer"
                  >
                    + Request switch log
                  </button>
                </div>

                <textarea
                  rows={4}
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  placeholder="Compose reply to sender..."
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F27421]"
                />

                {replySuccessMsg && (
                  <div className="p-2 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs flex items-center space-x-1.5 animate-in fade-in">
                    <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                    <span>{replySuccessMsg}</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-400">
                    Dispatches outbound email and logs in thread audit
                  </span>
                  <button
                    type="button"
                    onClick={handleSendReply}
                    disabled={isSendingReply || !replyText.trim()}
                    className="px-3 py-1.5 bg-[#0F142A] hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer shadow-2xs"
                  >
                    <Send size={12} />
                    <span>{isSendingReply ? 'Sending...' : 'Send Reply'}</span>
                  </button>
                </div>
              </div>

              {/* Collapsible Raw Ingested Payload */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowRawPayload(!showRawPayload)}
                  className="w-full px-3 py-2 bg-slate-50 hover:bg-slate-100/80 flex items-center justify-between text-xs text-slate-600 font-medium transition cursor-pointer"
                >
                  <span>Raw Ingested Payload</span>
                  {showRawPayload ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showRawPayload && (
                  <div className="bg-[#0F142A] text-slate-200 p-3 font-mono text-[11px] max-h-48 overflow-y-auto">
                    <pre>{selectedStaged.raw_payload ? (typeof selectedStaged.raw_payload === 'string' ? selectedStaged.raw_payload : JSON.stringify(selectedStaged.raw_payload, null, 2)) : 'No raw payload recorded.'}</pre>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Maker / Triage Notes</label>
                <textarea
                  rows={2}
                  value={actionNotes}
                  onChange={e => setActionNotes(e.target.value)}
                  placeholder="Add triage notes or resolution instructions for checker review..."
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F27421]"
                />
              </div>
            </div>

            {/* Footer CTAs */}
            <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setReviewDrawerOpen(false)}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Close
              </button>

              {(!selectedStaged.attachments || selectedStaged.attachments.length === 0) ? (
                <button
                  type="button"
                  onClick={() => handleCreateTaskWithoutAttachment(selectedStaged)}
                  className="px-4 py-2 bg-[#F27421] hover:bg-[#e06516] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Plus size={13} />
                  <span>Create Task from Request</span>
                </button>
              ) : selectedStaged.attachments.length === 1 ? (
                (selectedStaged.attachments[0].createdIssueId || selectedStaged.attachments[0].created_issue_id) ? (
                  <button
                    type="button"
                    onClick={() => {
                      setReviewDrawerOpen(false);
                      if (onNavigateToCase) {
                        onNavigateToCase(selectedStaged.attachments[0].createdIssueId || selectedStaged.attachments[0].created_issue_id);
                      }
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <ArrowUpRight size={13} />
                    <span>Open Case #{selectedStaged.attachments[0].createdIssueId || selectedStaged.attachments[0].created_issue_id}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleCreateTaskForAttachment(selectedStaged.attachments[0], selectedStaged)}
                    className="px-4 py-2 bg-[#F27421] hover:bg-[#e06516] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Plus size={13} />
                    <span>Create Task ({selectedStaged.attachments[0].filename})</span>
                  </button>
                )
              ) : (
                <span className="text-[11px] text-slate-500 font-medium">
                  {selectedStaged.attachments.length} files attached &bull; Manage tasks on files above
                </span>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* Quick Task Creation Modal */}
      {quickTaskModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-[#F27421]/10 text-[#F27421]">
                  <Plus size={16} />
                </div>
                <h3 className="text-base font-bold text-slate-900">Create New Task</h3>
              </div>
              <button
                type="button"
                onClick={() => setQuickTaskModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!quickTaskTitle.trim()) return;
                setIsSubmittingQuickTask(true);
                try {
                  const newIssue = await api.createIssue({
                    title: quickTaskTitle.trim(),
                    description: quickTaskDesc.trim(),
                    priority: quickTaskPriority,
                    teamId: teamId || undefined,
                    creatorId: currentUser?.id,
                    creatorName: currentUser?.username || 'Operator',
                    status: 'Open'
                  });
                  setSuccessMsg(`Task ${newIssue.id || 'created'} successfully!`);
                  setCreatedTasks(prev => [newIssue, ...prev]);
                  setQuickTaskModalOpen(false);
                  if (onNavigateToCase && newIssue.id) {
                    onNavigateToCase(newIssue.id);
                  }
                } catch (err: any) {
                  setErrorMsg(err.message || 'Failed to create task');
                } finally {
                  setIsSubmittingQuickTask(false);
                }
              }}
              className="p-6 space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Task Title <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Reconcile Sinqee Bank T+1 Settlement Exception"
                  value={quickTaskTitle}
                  onChange={e => setQuickTaskTitle(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#F27421]"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Priority
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {(['Low', 'Medium', 'High', 'Critical'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setQuickTaskPriority(p)}
                      className={`py-1.5 px-2 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                        quickTaskPriority === p
                          ? 'bg-[#F27421] text-white border-[#F27421]'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description / Operational Notes
                </label>
                <textarea
                  rows={4}
                  placeholder="Add background details, exception amounts, or instructions..."
                  value={quickTaskDesc}
                  onChange={e => setQuickTaskDesc(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-900 focus:outline-none focus:border-[#F27421] resize-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={() => setQuickTaskModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingQuickTask || !quickTaskTitle.trim()}
                  className="px-5 py-2 bg-[#F27421] hover:bg-[#e06516] disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-xs transition cursor-pointer flex items-center space-x-1.5"
                >
                  {isSubmittingQuickTask ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={13} />
                      <span>Create Task</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9. FTP Ingestion Schedule Configuration Modal */}
      <FtpScheduleConfigModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        config={selectedFtpConfigForSchedule}
        onSaved={async (updatedConfig) => {
          setSuccessMsg(`Schedule configuration updated for [${updatedConfig.name}].`);
          await loadAllData();
        }}
        onInitiateAfterSave={async (cfg) => {
          await handleInitiateSingleFtp(cfg);
        }}
      />
    </div>
  );
};
