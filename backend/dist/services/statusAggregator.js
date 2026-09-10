/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Calculates the parent Issue or TeamTask status strictly through aggregate evaluation.
 * Prohibits individual transactions from directly mutating the parent status.
 */
export function aggregateParentIssueStatus(transactions) {
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
        const status = String(t.investigationStatus || '').toUpperCase();
        if (status === 'RECONCILED') {
            reconciledCount++;
        }
        else if (status === 'CLOSED') {
            closedCount++;
        }
        else if (status === 'FLAGGED') {
            flaggedCount++;
        }
        else if (status === 'INVESTIGATING') {
            investigatingCount++;
        }
        else {
            pendingCount++;
        }
    }
    const totalTransactions = transactions.length;
    const completedCleanCount = reconciledCount + closedCount;
    let issueStatus;
    let summaryText;
    if (flaggedCount > 0) {
        // If even one transaction is FLAGGED, parent demands action
        issueStatus = 'ACTION_REQUIRED';
        summaryText = `${flaggedCount} transaction(s) flagged for manual review / remedy.`;
    }
    else if (investigatingCount > 0) {
        // If any are under investigation
        issueStatus = 'IN_PROGRESS';
        summaryText = `${investigatingCount} transaction(s) actively undergoing multi-stage verification.`;
    }
    else if (completedCleanCount === totalTransactions && totalTransactions > 0) {
        // All transactions resolved cleanly or closed
        if (closedCount === totalTransactions) {
            issueStatus = 'CLOSED';
            summaryText = `All ${totalTransactions} transactions successfully closed.`;
        }
        else {
            issueStatus = 'RESOLVED';
            summaryText = `All ${totalTransactions} transactions verified and reconciled cleanly.`;
        }
    }
    else {
        // All pending or not yet started
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
