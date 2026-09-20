/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ParentIssueAggregateStatus, TransactionInvestigationStatus } from '../types';

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

/**
 * Calculates the parent Issue or TeamTask status strictly through aggregate evaluation.
 * Prohibits individual transactions from directly mutating the parent status.
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
    const rawVal = (
      t.investigationStatus ||
      t.investigation_status ||
      t._validation_status ||
      t.validationStatus ||
      t.finalResult ||
      t.final_result ||
      t.status ||
      ''
    );
    const status = String(rawVal).trim().toUpperCase();

    if (
      status === 'VERIFIED_MATCH' ||
      status === 'RECONCILED' ||
      status === 'PASS' ||
      status === 'PASSED' ||
      status === 'SUCCESS'
    ) {
      reconciledCount++;
    } else if (status === 'CLOSED') {
      closedCount++;
    } else if (
      status === 'FLAGGED_DISCREPANCY' ||
      status === 'FLAGGED' ||
      status === 'FAIL' ||
      status === 'FAILED' ||
      status === 'DISCREPANCY' ||
      status === 'ERROR' ||
      status === 'NOT_FOUND_IN_TARGET_DB' ||
      status.includes('FAIL')
    ) {
      flaggedCount++;
    } else if (
      status === 'IN_PROGRESS' ||
      status === 'INVESTIGATING' ||
      status === 'PAUSED_DB_OFFLINE'
    ) {
      investigatingCount++;
    } else {
      // UNINVESTIGATED, PENDING, or un-evaluated
      pendingCount++;
    }
  }

  const totalTransactions = transactions.length;
  const completedCleanCount = reconciledCount + closedCount;

  let issueStatus: 'OPEN' | 'IN_PROGRESS' | 'ACTION_REQUIRED' | 'RESOLVED' | 'CLOSED';
  let summaryText: string;

  if (flaggedCount > 0) {
    // If even one transaction is FLAGGED or FAIL, parent demands action
    issueStatus = 'ACTION_REQUIRED';
    summaryText = `${flaggedCount} transaction(s) flagged for manual review / discrepancy.`;
  } else if (investigatingCount > 0) {
    // If any are under active investigation
    issueStatus = 'IN_PROGRESS';
    summaryText = `${investigatingCount} transaction(s) actively undergoing multi-stage verification.`;
  } else if (completedCleanCount === totalTransactions && totalTransactions > 0) {
    // All transactions resolved cleanly or closed
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
    // All pending or not yet evaluated
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
