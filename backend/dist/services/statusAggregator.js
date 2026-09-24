/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Calculates the rule execution verdicts strictly separated from case lifecycle.
 * Follows AGENTS.md Rule 2: Validation Result != Pipeline Action != Lifecycle.
 */
export function aggregateExecutionVerdicts(transactions) {
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
        const rawVerdict = (t._validation_status ||
            t.finalResult ||
            t.final_result ||
            t.validationStatus ||
            '').trim().toUpperCase();
        if (rawVerdict === 'PASS' || rawVerdict === 'PASSED' || rawVerdict === 'SUCCESS') {
            passCount++;
        }
        else if (rawVerdict === 'FAIL' || rawVerdict === 'FAILED' || rawVerdict.includes('FAIL')) {
            failCount++;
        }
        else if (rawVerdict === 'ERROR' || rawVerdict === 'EXCEPTION') {
            errorCount++;
        }
        else if (rawVerdict === 'PAUSED_DB_OFFLINE') {
            pausedCount++;
        }
        else if (rawVerdict === 'SKIPPED') {
            skippedCount++;
        }
    }
    const totalEvaluated = passCount + failCount + errorCount + pausedCount + skippedCount;
    let overallVerdict = 'UNTESTED';
    if (totalEvaluated > 0) {
        if (errorCount > 0) {
            overallVerdict = 'ERROR';
        }
        else if (pausedCount > 0) {
            overallVerdict = 'PAUSED_DB_OFFLINE';
        }
        else if (failCount > 0) {
            overallVerdict = 'FAIL';
        }
        else if (passCount > 0) {
            overallVerdict = 'PASS';
        }
        else {
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
        // 1. Prioritize explicit transaction investigation lifecycle state
        const explicitLifecycle = (t.investigationStatus || t.investigation_status || '').trim().toUpperCase();
        // 2. Fall back to status if no explicit investigation lifecycle
        const fallbackStatus = (t.status || '').trim().toUpperCase();
        // 3. Fall back to raw verdict only if nothing else is available
        const rawVerdict = (t._validation_status || t.finalResult || t.final_result || '').trim().toUpperCase();
        const effectiveStatus = explicitLifecycle || fallbackStatus || rawVerdict;
        if (effectiveStatus === 'VERIFIED_MATCH' ||
            effectiveStatus === 'RECONCILED' ||
            effectiveStatus === 'FORCE_MATCHED' ||
            (explicitLifecycle === '' && (effectiveStatus === 'PASS' || effectiveStatus === 'PASSED' || effectiveStatus === 'SUCCESS'))) {
            reconciledCount++;
        }
        else if (effectiveStatus === 'CLOSED' ||
            effectiveStatus === 'CLOSED_RESOLVED' ||
            effectiveStatus === 'CLOSED_UNRESOLVED') {
            closedCount++;
        }
        else if (effectiveStatus === 'FLAGGED_DISCREPANCY' ||
            effectiveStatus === 'FLAGGED' ||
            effectiveStatus === 'PENDING_CHECKER_REVIEW' ||
            effectiveStatus === 'MANUALLY_REVERSED' ||
            effectiveStatus === 'WRITTEN_OFF' ||
            effectiveStatus === 'FAIL' ||
            effectiveStatus === 'FAILED' ||
            effectiveStatus === 'DISCREPANCY' ||
            effectiveStatus === 'ERROR' ||
            effectiveStatus === 'NOT_FOUND_IN_TARGET_DB' ||
            effectiveStatus.includes('FAIL')) {
            flaggedCount++;
        }
        else if (effectiveStatus === 'IN_PROGRESS' ||
            effectiveStatus === 'INVESTIGATING' ||
            effectiveStatus === 'PAUSED_DB_OFFLINE') {
            investigatingCount++;
        }
        else {
            // UNINVESTIGATED, PENDING, or un-evaluated
            pendingCount++;
        }
    }
    const totalTransactions = transactions.length;
    const completedCleanCount = reconciledCount + closedCount;
    let issueStatus;
    let summaryText;
    if (flaggedCount > 0) {
        // If even one transaction is FLAGGED or has discrepancy, parent demands action
        issueStatus = 'ACTION_REQUIRED';
        summaryText = `${flaggedCount} transaction(s) flagged for manual review / discrepancy.`;
    }
    else if (investigatingCount > 0) {
        // If any are under active investigation
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
    else if (reconciledCount > 0) {
        issueStatus = 'IN_PROGRESS';
        summaryText = `${reconciledCount} of ${totalTransactions} transactions verified cleanly.`;
    }
    else {
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
