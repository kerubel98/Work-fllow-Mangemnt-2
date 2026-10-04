/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ParentIssueAggregateStatus,
  TransactionInvestigationStatus,
  CaseLifecycleStatus,
  ValidationVerdict
} from '../types';

export interface TransactionStatusItem {
  transactionId?: string;
  investigationStatus?: TransactionInvestigationStatus | string;
  investigation_status?: string;
  _validation_status?: string;
  validationStatus?: string;
  finalResult?: string;
  final_result?: string;
  status?: string;
}

export interface RuleExecutionAggregateMetrics {
  totalEvaluated: number;
  passCount: number;
  failCount: number;
  errorCount: number;
  pausedCount: number;
  skippedCount: number;
  overallVerdict: ValidationVerdict | 'UNTESTED';
}

/**
 * Calculates the rule execution verdicts strictly separated from case lifecycle.
 * Follows AGENTS.md Rule 2: Validation Result != Pipeline Action != Lifecycle.
 */
export function aggregateExecutionVerdicts(
  transactions: TransactionStatusItem[]
): RuleExecutionAggregateMetrics {
  if (!transactions || transactions.length === 0) {
    return {
      totalEvaluated: 0,
      passCount: 0,
      failCount: 0,
      errorCount: 0,
      pausedCount: 0,
      skippedCount: 0,
      overallVerdict: 'UNTESTED'
    };
  }

  let passCount = 0;
  let failCount = 0;
  let errorCount = 0;
  let pausedCount = 0;
  let skippedCount = 0;

  for (const t of transactions) {
    const rawVerdict = (
      t._validation_status ||
      t.finalResult ||
      t.final_result ||
      t.validationStatus ||
      ''
    ).trim().toUpperCase();

    if (rawVerdict === 'PASS' || rawVerdict === 'PASSED' || rawVerdict === 'SUCCESS') {
      passCount++;
    } else if (rawVerdict === 'FAIL' || rawVerdict === 'FAILED' || rawVerdict.includes('FAIL')) {
      failCount++;
    } else if (rawVerdict === 'ERROR' || rawVerdict === 'EXCEPTION') {
      errorCount++;
    } else if (rawVerdict === 'PAUSED_DB_OFFLINE') {
      pausedCount++;
    } else if (rawVerdict === 'SKIPPED') {
      skippedCount++;
    }
  }

  const totalEvaluated = passCount + failCount + errorCount + pausedCount + skippedCount;
  let overallVerdict: ValidationVerdict | 'UNTESTED' = 'UNTESTED';

  if (totalEvaluated > 0) {
    if (errorCount > 0) {
      overallVerdict = 'ERROR';
    } else if (pausedCount > 0) {
      overallVerdict = 'PAUSED_DB_OFFLINE';
    } else if (failCount > 0) {
      overallVerdict = 'FAIL';
    } else if (passCount > 0) {
      overallVerdict = 'PASS';
    } else {
      overallVerdict = 'SKIPPED';
    }
  }

  return {
    totalEvaluated,
    passCount,
    failCount,
    errorCount,
    pausedCount,
    skippedCount,
    overallVerdict
  };
}

/**
 * Calculates the parent Issue or TeamTask status strictly through aggregate evaluation of transaction investigation states.
 * Prohibits individual transactions from directly mutating the parent status.
 * Follows AGENTS.md Rule 3: Lifecycle Separation.
 */
export function aggregateParentIssueStatus(
  transactions: TransactionStatusItem[]
): ParentIssueAggregateStatus {
  if (!transactions || transactions.length === 0) {
    return {
      issueStatus: 'OPEN',
      reconciledCount: 0,
      flaggedCount: 0,
      closedCount: 0,
      investigatingCount: 0,
      pendingCount: 0,
      totalTransactions: 0,
      summaryText: 'No transactions associated with parent case.'
    };
  }

  let reconciledCount = 0;
  let flaggedCount = 0;
  let closedCount = 0;
  let investigatingCount = 0;
  let pendingCount = 0;

  for (const t of transactions) {
    const explicitLifecycle = (t.investigationStatus || t.investigation_status || '').trim().toUpperCase();
    const fallbackStatus = (t.status || '').trim().toUpperCase();
    const rawVerdict = (t._validation_status || t.finalResult || t.final_result || '').trim().toUpperCase();

    const effectiveStatus = explicitLifecycle || fallbackStatus || rawVerdict;

    if (
      effectiveStatus === 'VERIFIED_MATCH' ||
      effectiveStatus === 'RECONCILED' ||
      effectiveStatus === 'FORCE_MATCHED' ||
      (explicitLifecycle === '' && (effectiveStatus === 'PASS' || effectiveStatus === 'PASSED' || effectiveStatus === 'SUCCESS'))
    ) {
      reconciledCount++;
    } else if (
      effectiveStatus === 'CLOSED' ||
      effectiveStatus === 'CLOSED_RESOLVED' ||
      effectiveStatus === 'CLOSED_UNRESOLVED'
    ) {
      closedCount++;
    } else if (
      effectiveStatus === 'FLAGGED_DISCREPANCY' ||
      effectiveStatus === 'FLAGGED' ||
      effectiveStatus === 'PENDING_CHECKER_REVIEW' ||
      effectiveStatus === 'MANUALLY_REVERSED' ||
      effectiveStatus === 'WRITTEN_OFF' ||
      effectiveStatus === 'FAIL' ||
      effectiveStatus === 'FAILED' ||
      effectiveStatus === 'DISCREPANCY' ||
      effectiveStatus === 'ERROR' ||
      effectiveStatus === 'NOT_FOUND_IN_TARGET_DB' ||
      effectiveStatus.includes('FAIL')
    ) {
      flaggedCount++;
    } else if (
      effectiveStatus === 'IN_PROGRESS' ||
      effectiveStatus === 'INVESTIGATING' ||
      effectiveStatus === 'PAUSED_DB_OFFLINE'
    ) {
      investigatingCount++;
    } else {
      pendingCount++;
    }
  }

  const totalTransactions = transactions.length;
  const completedCleanCount = reconciledCount + closedCount;

  let issueStatus: CaseLifecycleStatus;
  let summaryText: string;

  if (flaggedCount > 0) {
    issueStatus = 'ACTION_REQUIRED';
    summaryText = `${flaggedCount} transaction(s) flagged for manual review / discrepancy.`;
  } else if (investigatingCount > 0) {
    issueStatus = 'IN_PROGRESS';
    summaryText = `${investigatingCount} transaction(s) actively undergoing multi-stage verification.`;
  } else if (completedCleanCount === totalTransactions && totalTransactions > 0) {
    if (closedCount === totalTransactions) {
      issueStatus = 'CLOSED';
      summaryText = `All ${totalTransactions} transactions successfully closed.`;
    } else {
      issueStatus = 'RESOLVED';
      summaryText = `All ${totalTransactions} transactions verified and reconciled cleanly.`;
    }
  } else if (reconciledCount > 0) {
    issueStatus = 'IN_PROGRESS';
    summaryText = `${reconciledCount} of ${totalTransactions} transactions verified cleanly.`;
  } else {
    issueStatus = 'OPEN';
    summaryText = `${pendingCount} transaction(s) queued for investigation workflow.`;
  }

  return {
    issueStatus,
    reconciledCount,
    flaggedCount,
    closedCount,
    investigatingCount,
    pendingCount,
    totalTransactions,
    summaryText
  };
}

export interface MultiStageDiscrepancyClassification {
  discrepancyCode: 'CLEAN_VERIFIED' | 'ORPHAN_SETTLEMENT' | 'UNSETTLED_AUTHORIZATION' | 'SETTLEMENT_AMOUNT_MISMATCH' | 'GHOST_TRANSACTION' | 'GENERIC_DISCREPANCY';
  riskSeverity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  businessDescription: string;
  makerCheckerRecommended: boolean;
}

/**
 * Classifies multi-stage operational discrepancies from the complete stage traversal trace.
 * Implements PIPELINE_ENGINE_MASTER_ARCHITECTURE.md §6 and §11.
 */
export function classifyMultiStageDiscrepancy(
  transaction: Record<string, any>
): MultiStageDiscrepancyClassification {
  const stageResults: any[] =
    transaction.auditTrail ||
    transaction._stage_results ||
    transaction._validation_details?.stageResults ||
    transaction.stagesTraversed ||
    [];

  if (stageResults.length < 2) {
    const rawStatus = (transaction._validation_status || transaction.finalResult || '').toUpperCase();
    if (rawStatus === 'PASS' || rawStatus === 'VERIFIED_MATCH') {
      return {
        discrepancyCode: 'CLEAN_VERIFIED',
        riskSeverity: 'NONE',
        businessDescription: 'Transaction verified and matched cleanly.',
        makerCheckerRecommended: false
      };
    }
    return {
      discrepancyCode: 'GENERIC_DISCREPANCY',
      riskSeverity: 'MEDIUM',
      businessDescription: 'Single-stage discrepancy flagged for operator review.',
      makerCheckerRecommended: true
    };
  }

  // Multi-stage inspection
  const stage1 = stageResults[0];
  const stage2 = stageResults[1];

  const stage1Pass = stage1.validationResult === 'PASS' || stage1.status === 'PASS';
  const stage2Pass = stage2.validationResult === 'PASS' || stage2.status === 'PASS';

  // Check if records were physically matched in each external database
  const stage1Match = stage1.matchFound !== false && (stage1Pass || stage1.existence !== 'NOT_FOUND_IN_TARGET_DB');
  const stage2Match = stage2.matchFound !== false && (stage2Pass || stage2.existence !== 'NOT_FOUND_IN_TARGET_DB');

  // Check for amount variance or numeric discrepancy between legs
  const hasAmountVariance =
    (stage2.checkType === 'AMOUNT_MATCH' && !stage2Pass && stage2Match) ||
    Boolean(stage2.discrepancyReasons?.some((r: string) => /amount|variance|mismatch|fee/i.test(r))) ||
    Boolean(stage2.message && /amount|variance|mismatch/i.test(stage2.message));

  if (stage1Pass && stage2Pass && !hasAmountVariance) {
    return {
      discrepancyCode: 'CLEAN_VERIFIED',
      riskSeverity: 'NONE',
      businessDescription: 'Clean multi-system match across authorization and financial settlement.',
      makerCheckerRecommended: false
    };
  }

  // Case A: Both found, but settlement amount or fee diverges
  if (stage1Match && stage2Match && (hasAmountVariance || (!stage2Pass && stage1Pass))) {
    return {
      discrepancyCode: 'SETTLEMENT_AMOUNT_MISMATCH',
      riskSeverity: 'HIGH',
      businessDescription: 'Settlement Amount Mismatch: Transaction authorized and settled, but ledger amounts or rules diverge.',
      makerCheckerRecommended: true
    };
  }

  // Case B: Missing Auth + Found in Settlement (ORPHAN SETTLEMENT)
  if (!stage1Pass && stage2Match) {
    return {
      discrepancyCode: 'ORPHAN_SETTLEMENT',
      riskSeverity: 'CRITICAL',
      businessDescription: '⚠️ Orphan Settlement: Money cleared in financial ledger without valid gateway authorization!',
      makerCheckerRecommended: true
    };
  }

  // Case C: Authorized + Missing in Settlement (UNSETTLED AUTHORIZATION)
  if (stage1Pass && !stage2Match) {
    return {
      discrepancyCode: 'UNSETTLED_AUTHORIZATION',
      riskSeverity: 'HIGH',
      businessDescription: 'Unsettled Authorization: Transaction approved by gateway but missing in financial ledger.',
      makerCheckerRecommended: true
    };
  }

  // Case D: Missing in all systems
  return {
    discrepancyCode: 'GHOST_TRANSACTION',
    riskSeverity: 'HIGH',
    businessDescription: 'Ghost Record: Missing or failed validation in all external database stages.',
    makerCheckerRecommended: true
  };
}

