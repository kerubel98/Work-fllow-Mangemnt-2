/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Inbox, RefreshCw, Search, Mail, FileText, ChevronRight, X,
  CheckCircle2, AlertTriangle, Terminal, Server, Shield, Eye,
  Play, Check, Plus, ExternalLink, ArrowUpRight, Clock, UserCheck,
  Calendar, Layers, Zap, Database, RotateCcw, Settings2, SlidersHorizontal
} from 'lucide-react';
import { Team, User, FtpFileStagingConfig } from '../../types';
import { api } from '../../api/client';
import { ErrorBoundary } from '../ErrorBoundary';
import { DataTablePagination } from '../common/DataTablePagination';
import { FtpScheduleConfigModal } from './FtpScheduleConfigModal';

interface IntakeViewProps {
  currentTeam?: Team | null;
  currentUser?: User | null;
  onNavigateToCase?: (caseId: string) => void;
  onNavigateToCreateTask?: (prefill?: any) => void;
}

export const IntakeView: React.FC<IntakeViewProps> = ({ 
  currentTeam = null, 
  currentUser = null,
  onNavigateToCase,
  onNavigateToCreateTask
}) => {
  return (
    <ErrorBoundary fallbackTitle="Intake Cockpit Error">
      <IntakeViewContent 
        currentTeam={currentTeam} 
        currentUser={currentUser} 
        onNavigateToCase={onNavigateToCase} 
        onNavigateToCreateTask={onNavigateToCreateTask}
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
  onNavigateToCreateTask
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'requests' | 'ftp_feeds' | 'providers' | 'webhooks' | 'simulator'>('requests');
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
  const [stagedMessages, setStagedMessages] = useState<any[]>(DEFAULT_INTAKE_ITEMS);
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

  // Simulator State
  const [simChannel, setSimChannel] = useState<'email' | 'teams' | 'whatsapp' | 'telegram'>('email');
  const [simSender, setSimSender] = useState('corporate_client@partnerbank.com');
  const [simText, setSimText] = useState('URGENT: Reconcile attached settlement feed for account ACC-99214. Discrepancy amount $14,250.00 observed.');
  const [simRunning, setSimRunning] = useState(false);

  const teamId = currentTeam?.id || '';

  const loadAllData = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [summ, staged, provs, cfgs, loadedFtp] = await Promise.all([
        teamId ? api.getExternalRequestSummary(teamId).catch(() => null) : Promise.resolve(null),
        teamId ? api.getStagedMessages({ teamId, limit: 100 }).catch(() => []) : Promise.resolve([]),
        teamId ? api.getMessageProviders({ teamId }).catch(() => []) : Promise.resolve([]),
        teamId ? api.getTeamChannelConfigs(teamId).catch(() => []) : Promise.resolve([]),
        api.getFtpStagingConfigs().catch(() => [])
      ]);
      if (summ) setSummary(summ);
      if (Array.isArray(staged) && staged.length > 0) {
        setStagedMessages(staged);
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
    setReviewDrawerOpen(true);
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

      {/* 2. 6-Card KPI Summary Metrics Grid matching 19_intake.png */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
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
                    <th className="py-3 px-4 font-normal">AI confidence</th>
                    <th className="py-3 px-4 font-normal">Attachments</th>
                    <th className="py-3 px-4 font-normal">Status</th>
                    <th className="py-3 px-4 font-normal text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {paginatedMessages.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-sans">
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
                      const confidencePercent = Math.round((msg.confidence_score ?? 0.5) * 100);

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

                          {/* AI Confidence */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center space-x-2">
                              <div className="w-14 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className="bg-[#0F142A] h-full rounded-full" 
                                  style={{ width: `${confidencePercent}%` }} 
                                />
                              </div>
                              <span className="text-xs text-slate-400 font-sans">
                                {confidencePercent}%
                              </span>
                            </div>
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

                          {/* Review & Create Case Action */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleOpenReview(msg)}
                                className="px-2.5 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-medium font-sans shadow-2xs transition-colors cursor-pointer"
                              >
                                Review
                              </button>
                              {onNavigateToCreateTask && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onNavigateToCreateTask({
                                      title: msg.subject || 'Intake Case',
                                      description: `Ingested from ${msg.channel || 'Intake'} (${msg.sender_address || msg.senderAddress || ''})\nCategory: ${msg.category || 'Reconciliation exception'}`,
                                      priority: msg.parsed_fields?.priority || (msg.urgency === 'critical' ? 'Critical' : msg.urgency === 'high' ? 'High' : 'Medium'),
                                      sourceMessageId: msg.id,
                                      attachments: msg.attachments || []
                                    });
                                  }}
                                  className="px-2.5 py-1 bg-[#F27421]/10 hover:bg-[#F27421] text-[#F27421] hover:text-white rounded-lg text-xs font-semibold font-sans transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                                  title="Create case directly from this intake request with attached files"
                                >
                                  <Plus size={12} />
                                  <span>Create Case</span>
                                </button>
                              )}
                            </div>
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
          {/* Top Operational Metrics Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 shrink-0">
            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Configured Feeds</span>
              <p className="text-2xl font-bold font-heading text-slate-900 flex items-center justify-between">
                <span>{ftpConfigs.length}</span>
                <Server size={18} className="text-slate-400" />
              </p>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Active Schedules</span>
              <p className="text-2xl font-bold font-heading text-emerald-600 flex items-center justify-between">
                <span>{ftpConfigs.filter(c => c.scheduleConfig?.enabled).length}</span>
                <Clock size={18} className="text-emerald-500" />
              </p>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Total Rows Staged</span>
              <p className="text-2xl font-bold font-heading text-[#F27421] flex items-center justify-between">
                <span>{ftpConfigs.reduce((acc, c) => acc + (c.lastStagedCount || 0), 0).toLocaleString()}</span>
                <Database size={18} className="text-[#F27421]" />
              </p>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
              <span className="text-xs text-slate-500 font-medium font-sans block">Automated Engine</span>
              <p className="text-xs font-semibold font-sans text-slate-700 flex items-center gap-1.5 mt-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Scheduler Service Online</span>
              </p>
            </div>
          </div>

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

              {selectedStaged.attachments?.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Attached Files</label>
                  <div className="space-y-1.5">
                    {selectedStaged.attachments.map((att: any, i: number) => (
                      <div key={i} className="flex items-center space-x-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                        <FileText size={14} className="text-[#F27421]" />
                        <span className="font-mono text-slate-700 truncate">{att.filename || `attachment_${i+1}.xlsx`}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Raw Ingested Payload</label>
                <div className="bg-[#0F142A] text-slate-200 p-3 rounded-xl font-mono text-[11px] max-h-48 overflow-y-auto">
                  <pre>{selectedStaged.raw_payload || 'No raw payload recorded.'}</pre>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Maker / Triage Notes</label>
                <textarea
                  rows={3}
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
                onClick={() => {
                  setReviewDrawerOpen(false);
                  if (onNavigateToCreateTask) {
                    onNavigateToCreateTask({
                      title: selectedStaged.subject,
                      description: `Ingested from ${selectedStaged.channel || 'Intake'} (${selectedStaged.sender_address || ''})\nCategory: ${selectedStaged.category || 'Reconciliation'}\nNotes: ${actionNotes}`,
                      priority: selectedStaged.parsed_fields?.priority || (selectedStaged.urgency === 'high' ? 'High' : 'Medium'),
                      sourceMessageId: selectedStaged.id,
                      attachments: selectedStaged.attachments || []
                    });
                  } else {
                    setQuickTaskTitle(selectedStaged.subject || '');
                    setQuickTaskDesc(`Ingested from ${selectedStaged.channel || 'Intake'} (${selectedStaged.sender_address || ''})\nCategory: ${selectedStaged.category || 'Reconciliation'}\nNotes: ${actionNotes}`);
                    setQuickTaskPriority(selectedStaged.parsed_fields?.priority || 'Medium');
                    setQuickTaskModalOpen(true);
                  }
                }}
                className="px-4 py-2 bg-[#F27421] hover:bg-[#e06516] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Plus size={13} />
                <span>Create Task</span>
              </button>
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
