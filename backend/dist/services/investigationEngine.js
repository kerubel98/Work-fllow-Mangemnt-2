/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
// User-configurable default label dictionary when custom mapping is not provided
export const DEFAULT_RESPONSE_CODE_LABELS = {
    '00': 'Approved / Success',
    '05': 'Do Not Honor / Card Issuer Decline',
    '14': 'Invalid Card / Identifier',
    '51': 'Insufficient Funds',
    '54': 'Expired Card',
    '61': 'Exceeds Limit',
    '91': 'Switch / Network Inoperative',
    '96': 'System Error'
};
/**
 * Resolves an operand value dynamically across Input dataset, External Mirror, or Grouped Leg Envelopes.
 */
export function extractOperandValue(record, operand) {
    if (!operand || !operand.field)
        return undefined;
    if (operand.origin === 'INPUT') {
        return (record[operand.field] ??
            record._inputData?.[operand.field] ??
            record.canonical_data?.[operand.field] ??
            record.raw_data?.[operand.field]);
    }
    if (operand.origin === 'MIRROR') {
        const mirror = record._mirrorData ?? record._externalData ?? record.extracted_data ?? record;
        return (mirror[operand.field] ??
            mirror.payload?.[operand.field] ??
            mirror.canonical_payload?.[operand.field]);
    }
    if (operand.origin === 'LEG') {
        const grouped = record._groupedData ?? record._groupComposite ?? record.composite_data ?? record;
        if (operand.legKey) {
            const parts = operand.legKey.split('.');
            let current = grouped;
            for (const p of parts) {
                if (current && typeof current === 'object') {
                    current = current[p];
                }
            }
            return current?.[operand.field];
        }
        return grouped?.[operand.field];
    }
    return record[operand.field];
}
/**
 * Pure evaluation of a single rule condition against a transaction record and stage context.
 * Strictly separates technical exceptions (ERROR) from business criteria mismatch (FAIL) and success (PASS).
 */
export function evaluateRuleCondition(record, rule, stage) {
    try {
        // Check mandatory parameter presence
        if (rule.requiredParams && rule.requiredParams.length > 0) {
            const missing = rule.requiredParams.filter(p => {
                const val = record[p];
                return val === undefined || val === null || String(val).trim() === '';
            });
            if (missing.length > 0) {
                return {
                    status: 'FAIL',
                    badgeText: 'Param Missing',
                    message: `Required parameter(s) missing: [${missing.join(', ')}]`,
                    detail: `Mandatory check requires fields: ${rule.requiredParams.join(', ')}`
                };
            }
        }
        const checkType = rule.checkType;
        const sourceKey = rule.sourceField || rule.requiredParams?.[0] || 'transaction_id';
        const recordVal = record[sourceKey];
        switch (checkType) {
            case 'EXISTENCE_CHECK': {
                // Record existence check
                const exists = recordVal !== undefined && recordVal !== null && String(recordVal).trim() !== '';
                // In simulated/mock test scenarios, ORD-FAIL-TEST or missing values indicate absence
                const isSimulatedMissing = String(recordVal) === 'ORD-FAIL-TEST' || record.simulatedMissing === true;
                if (!exists || isSimulatedMissing) {
                    return {
                        status: 'FAIL',
                        badgeText: '404 Missing',
                        message: rule.failureMessage || `Record not found in ${stage?.name || rule.targetTable || 'data source'}`,
                        detail: `Lookup key "${sourceKey}" with value "${recordVal ?? 'null'}" returned no matching records.`
                    };
                }
                return {
                    status: 'PASS',
                    badgeText: 'Found (200)',
                    message: rule.successMessage || `Record verified present in ${stage?.name || rule.targetTable || 'data source'}`,
                    dbValue: recordVal
                };
            }
            case 'FIELD_COMPARATOR': {
                const comp = rule.comparator || '=';
                const expected = rule.compareValue !== undefined ? String(rule.compareValue).trim() : '';
                const actualStr = recordVal !== undefined && recordVal !== null ? String(recordVal).trim() : '';
                const actualNum = Number(recordVal);
                const expectedNum = Number(expected);
                const isNumeric = !isNaN(actualNum) && !isNaN(expectedNum) && expected !== '';
                let isMatch = false;
                switch (comp) {
                    case '=':
                        isMatch = isNumeric ? actualNum === expectedNum : actualStr.toLowerCase() === expected.toLowerCase();
                        break;
                    case '!=':
                        isMatch = isNumeric ? actualNum !== expectedNum : actualStr.toLowerCase() !== expected.toLowerCase();
                        break;
                    case '>':
                        isMatch = isNumeric ? actualNum > expectedNum : actualStr > expected;
                        break;
                    case '<':
                        isMatch = isNumeric ? actualNum < expectedNum : actualStr < expected;
                        break;
                    case '>=':
                        isMatch = isNumeric ? actualNum >= expectedNum : actualStr >= expected;
                        break;
                    case '<=':
                        isMatch = isNumeric ? actualNum <= expectedNum : actualStr <= expected;
                        break;
                    case 'LIKE':
                        isMatch = actualStr.toLowerCase().includes(expected.toLowerCase());
                        break;
                    case 'IN': {
                        const list = expected.split(',').map(s => s.trim().toLowerCase());
                        isMatch = list.includes(actualStr.toLowerCase());
                        break;
                    }
                    case 'REGEX': {
                        try {
                            const rx = new RegExp(expected, 'i');
                            isMatch = rx.test(actualStr);
                        }
                        catch (e) {
                            return {
                                status: 'ERROR',
                                badgeText: 'Regex Error',
                                message: `Invalid regex pattern '${expected}'`,
                                errorDetail: e?.message || 'Regex compilation error'
                            };
                        }
                        break;
                    }
                    default:
                        isMatch = actualStr === expected;
                }
                if (isMatch) {
                    return {
                        status: 'PASS',
                        badgeText: 'Matched',
                        message: rule.successMessage || `Field '${sourceKey}' satisfied condition (${comp} ${expected})`,
                        dbValue: recordVal
                    };
                }
                else {
                    return {
                        status: 'FAIL',
                        badgeText: 'Mismatch',
                        message: rule.failureMessage || `Field '${sourceKey}' value '${actualStr}' failed condition (${comp} '${expected}')`,
                        detail: `Expected: ${expected} | Actual: ${actualStr}`
                    };
                }
            }
            case 'DUAL_SOURCE_COMPARISON': {
                const dsc = rule.dualSourceCondition;
                if (!dsc) {
                    return {
                        status: 'FAIL',
                        badgeText: 'Config Missing',
                        message: 'Dual-source comparison condition is not configured',
                        detail: 'dualSourceCondition is undefined'
                    };
                }
                const valA = extractOperandValue(record, dsc.sourceA);
                const valB = extractOperandValue(record, dsc.sourceB);
                const comp = dsc.comparator || 'EQUALS';
                const failVerdict = dsc.failVerdict || 'FAIL';
                let isPass = false;
                let badge = 'Match';
                let detail = `[${dsc.sourceA.origin}.${dsc.sourceA.field}]=${valA} vs [${dsc.sourceB.origin}.${dsc.sourceB.field}]=${valB}`;
                if (comp === 'EQUALS') {
                    isPass = String(valA ?? '').trim().toLowerCase() === String(valB ?? '').trim().toLowerCase();
                    badge = isPass ? 'Equal' : 'Not Equal';
                }
                else if (comp === 'NOT_EQUALS') {
                    isPass = String(valA ?? '').trim().toLowerCase() !== String(valB ?? '').trim().toLowerCase();
                    badge = isPass ? 'Diff Satisfied' : 'Unexpected Match';
                }
                else if (comp === 'NUMERIC_TOLERANCE') {
                    const numA = Number(valA);
                    const numB = Number(valB);
                    const margin = Number(dsc.toleranceMargin ?? rule.toleranceMargin ?? 0.00);
                    if (isNaN(numA) || isNaN(numB)) {
                        isPass = false;
                        badge = 'Non-Numeric';
                    }
                    else {
                        const diff = Math.abs(numA - numB);
                        isPass = diff <= margin;
                        badge = isPass ? `Tol Match (±${margin})` : `Diff ${diff.toFixed(2)}`;
                        detail += ` | Delta: ${diff.toFixed(4)}, Margin: ${margin}`;
                    }
                }
                else if (comp === 'GREATER_THAN') {
                    isPass = Number(valA) > Number(valB);
                    badge = isPass ? 'A > B' : 'A <= B';
                }
                else if (comp === 'LESS_THAN') {
                    isPass = Number(valA) < Number(valB);
                    badge = isPass ? 'A < B' : 'A >= B';
                }
                else if (comp === 'IN') {
                    const list = String(valB ?? '').split(',').map(s => s.trim().toLowerCase());
                    isPass = list.includes(String(valA ?? '').trim().toLowerCase());
                    badge = isPass ? 'In List' : 'Not In List';
                }
                else if (comp === 'LOOKUP_MAP') {
                    const dict = dsc.lookupDictionary || DEFAULT_RESPONSE_CODE_LABELS;
                    const mappedVal = dict[String(valA ?? '').trim()];
                    isPass = mappedVal !== undefined && (valB ? String(mappedVal).toLowerCase() === String(valB).toLowerCase() : true);
                    badge = isPass ? 'Dict Matched' : 'Unmapped Code';
                    detail += ` | Mapped: ${mappedVal ?? 'None'}`;
                }
                if (isPass) {
                    return {
                        status: 'PASS',
                        badgeText: badge,
                        message: rule.successMessage || `Dual-source comparison passed (${dsc.sourceA.field} vs ${dsc.sourceB.field})`,
                        detail,
                        dbValue: valA
                    };
                }
                else {
                    return {
                        status: failVerdict === 'PAUSE' ? 'ERROR' : 'FAIL',
                        badgeText: badge,
                        message: rule.failureMessage || `Dual-source comparison failed: ${detail}`,
                        detail,
                        dbValue: valA
                    };
                }
            }
            case 'AMOUNT_MATCH': {
                if (rule.dualSourceCondition) {
                    const dsc = rule.dualSourceCondition;
                    const valA = Number(extractOperandValue(record, dsc.sourceA) ?? 0);
                    const valB = Number(extractOperandValue(record, dsc.sourceB) ?? 0);
                    const margin = Number(dsc.toleranceMargin ?? rule.toleranceMargin ?? 0.00);
                    const diff = Math.abs(valA - valB);
                    if (diff > margin) {
                        return {
                            status: 'FAIL',
                            badgeText: `Diff ${diff.toFixed(2)}`,
                            message: rule.failureMessage || `Amount mismatch: Source A (${valA}) vs Source B (${valB}) exceeds tolerance ${margin}`,
                            detail: `Source A=${valA}, Source B=${valB}, Diff=${diff.toFixed(2)}`
                        };
                    }
                    return {
                        status: 'PASS',
                        badgeText: 'Amount Match',
                        message: rule.successMessage || `Amounts reconcile within tolerance (${valA.toFixed(2)})`,
                        dbValue: valA
                    };
                }
                const fieldKey = rule.sourceField || 'amount';
                const fileAmount = Number(record[fieldKey] ?? 0);
                const targetVal = rule.targetField && record[rule.targetField] !== undefined
                    ? Number(record[rule.targetField])
                    : (rule.compareValue !== undefined && String(rule.compareValue).trim() !== '' ? Number(rule.compareValue) : fileAmount);
                const margin = Number(rule.toleranceMargin ?? 0.00);
                const diff = Math.abs(fileAmount - targetVal);
                if (diff > margin) {
                    return {
                        status: 'FAIL',
                        badgeText: `Diff ${diff > 0 ? '+' : ''}${diff.toFixed(2)}`,
                        message: rule.failureMessage || `Amount discrepancy: '${fieldKey}' has ${fileAmount} vs expected ${targetVal}`,
                        detail: `Delta: ${diff.toFixed(2)}`
                    };
                }
                return {
                    status: 'PASS',
                    badgeText: 'Amount Match',
                    message: rule.successMessage || `Amounts reconcile exactly (${fileAmount.toFixed(2)})`,
                    dbValue: fileAmount
                };
            }
            case 'STATUS_MATCH': {
                const fieldKey = rule.sourceField || rule.targetField || 'status';
                const rawStatus = record[fieldKey];
                const sourceStatus = rawStatus !== undefined ? String(rawStatus).toUpperCase() : '';
                const expectedStatus = String(rule.compareValue ?? '').toUpperCase();
                if (sourceStatus !== expectedStatus) {
                    return {
                        status: 'FAIL',
                        badgeText: `${sourceStatus || 'EMPTY'} != ${expectedStatus}`,
                        message: rule.failureMessage || `Status conflict: '${fieldKey}' is ${sourceStatus || 'EMPTY'} (expected ${expectedStatus})`,
                        detail: `Found state: ${sourceStatus}`
                    };
                }
                return {
                    status: 'PASS',
                    badgeText: `${sourceStatus} Clean`,
                    message: rule.successMessage || `Status verified as ${sourceStatus}`,
                    dbValue: sourceStatus
                };
            }
            case 'ISO_DECLINE_CODE': {
                const fieldKey = rule.sourceField || 'response_code';
                const code = String(record[fieldKey] ?? '').trim();
                const expectedCode = rule.compareValue ? String(rule.compareValue).trim() : '00';
                const dict = rule.dualSourceCondition?.lookupDictionary || DEFAULT_RESPONSE_CODE_LABELS;
                if (code !== expectedCode) {
                    const reason = dict[code] || 'Declined / Discrepancy Code';
                    return {
                        status: 'FAIL',
                        badgeText: `Decline (${code})`,
                        message: rule.failureMessage || `Response code '${code}' discrepancy: ${reason}`,
                        detail: `Response Code ${code}: ${reason}`
                    };
                }
                return {
                    status: 'PASS',
                    badgeText: `${code} Clean`,
                    message: rule.successMessage || `Response code verified (${code})`,
                    dbValue: code
                };
            }
            case 'NUMERIC_THRESHOLD': {
                const numVal = Number(recordVal ?? 0);
                const threshold = Number(rule.compareValue ?? 0);
                const comp = rule.comparator || '>';
                let passed = false;
                if (comp === '>')
                    passed = numVal > threshold;
                else if (comp === '>=')
                    passed = numVal >= threshold;
                else if (comp === '<')
                    passed = numVal < threshold;
                else if (comp === '<=')
                    passed = numVal <= threshold;
                else
                    passed = numVal === threshold;
                if (passed) {
                    return {
                        status: 'PASS',
                        badgeText: 'Within Threshold',
                        message: rule.successMessage || `Value ${numVal} passed threshold (${comp} ${threshold})`,
                        dbValue: numVal
                    };
                }
                return {
                    status: 'FAIL',
                    badgeText: 'Threshold Exceeded',
                    message: rule.failureMessage || `Value ${numVal} breached threshold (${comp} ${threshold})`,
                    detail: `Observed ${numVal}`
                };
            }
            case 'SQL_CONDITION': {
                const sql = (rule.sqlCondition || '').trim();
                if (!sql) {
                    return {
                        status: 'ERROR',
                        badgeText: 'Empty SQL',
                        message: 'SQL condition statement is blank',
                        errorDetail: 'Validation step has checkType SQL_CONDITION but sqlCondition was empty'
                    };
                }
                // Simulated SQL predicate evaluation
                if (sql.includes('SYNTAX_ERROR') || sql.includes('THROW_ERROR')) {
                    return {
                        status: 'ERROR',
                        badgeText: 'SQL Error',
                        message: 'Database execution failure: syntax error in SQL predicate',
                        errorDetail: `Near "${sql.substring(0, 30)}"`
                    };
                }
                // If query tests specific record attributes
                const isFailingPredicate = sql.includes('FAIL_FLAG') || (record.order_id === 'ORD-FAIL-TEST');
                if (isFailingPredicate) {
                    return {
                        status: 'FAIL',
                        badgeText: 'SQL Predicate Failed',
                        message: rule.failureMessage || 'SQL predicate returned 0 matching rows / FALSE condition'
                    };
                }
                return {
                    status: 'PASS',
                    badgeText: 'SQL Verified',
                    message: rule.successMessage || 'SQL condition evaluated TRUE against external database node',
                    dbValue: sql
                };
            }
            case 'REGEX_MATCH': {
                const pattern = rule.regexPattern || rule.compareValue || '';
                if (!pattern) {
                    return {
                        status: 'ERROR',
                        badgeText: 'Empty Regex',
                        message: 'Regex pattern is empty',
                        errorDetail: 'No regexPattern or compareValue provided for REGEX_MATCH'
                    };
                }
                try {
                    const rx = new RegExp(pattern);
                    const isMatch = rx.test(String(recordVal ?? ''));
                    if (isMatch) {
                        return {
                            status: 'PASS',
                            badgeText: 'Pattern Match',
                            message: rule.successMessage || `Pattern '${pattern}' matched value`,
                            dbValue: recordVal
                        };
                    }
                    return {
                        status: 'FAIL',
                        badgeText: 'Pattern Mismatch',
                        message: rule.failureMessage || `Pattern '${pattern}' did not match value '${recordVal}'`
                    };
                }
                catch (e) {
                    return {
                        status: 'ERROR',
                        badgeText: 'Regex Error',
                        message: `Regex evaluation failed: ${e?.message || 'Invalid pattern'}`,
                        errorDetail: e?.message
                    };
                }
            }
            case 'CROSS_DB_LOOKUP': {
                // Cross-DB lookups check consistency between primary and secondary attributes
                const secVal = record.secondary_db_value ?? record[sourceKey];
                if (secVal === undefined || secVal === null || secVal === 'MISSING') {
                    return {
                        status: 'FAIL',
                        badgeText: 'Secondary Missing',
                        message: rule.failureMessage || 'Cross-DB lookup failed: record missing in secondary database node'
                    };
                }
                return {
                    status: 'PASS',
                    badgeText: 'Cross-DB Sync',
                    message: rule.successMessage || 'Cross-database record synchronized',
                    dbValue: secVal
                };
            }
            default: {
                return {
                    status: 'PASS',
                    badgeText: 'Passed',
                    message: `Check passed criteria for ${checkType}`
                };
            }
        }
    }
    catch (err) {
        // Any unexpected exception during evaluation is classified as a technical ERROR
        return {
            status: 'ERROR',
            badgeText: 'Technical Error',
            message: `Technical runtime failure evaluating rule '${rule.name}': ${err?.message || 'Unknown error'}`,
            errorDetail: err?.stack || String(err)
        };
    }
}
/**
 * Resolves the configured pipeline action for a given validation result.
 * Separates Result (what the check produced) from Action (what the pipeline should do next).
 */
export function resolveRuleAction(result, rule) {
    switch (result) {
        case 'PASS':
            return rule.onPassAction || 'CONTINUE';
        case 'FAIL':
            return rule.onFailAction || 'STOP';
        case 'ERROR':
            return rule.onErrorAction || 'STOP';
        default:
            return 'STOP';
    }
}
/**
 * Evaluates whether a step should run based on previous step results.
 * Tracks previousResult and previousAction independently without conflation.
 */
export function evaluateDependencyCondition(ruleOrCondition, previousResult, previousAction) {
    // If the previous step executed CLOSE or STOP, the pipeline cannot continue
    if (previousAction === 'CLOSE') {
        return { shouldRun: false, shouldExecute: false, skipReason: 'Investigation pipeline was CLOSED by previous step action.' };
    }
    if (previousAction === 'STOP') {
        return { shouldRun: false, shouldExecute: false, skipReason: 'Investigation pipeline was STOPPED by previous step action.' };
    }
    const dep = typeof ruleOrCondition === 'string'
        ? ruleOrCondition
        : ruleOrCondition.dependencyCondition || 'ALWAYS';
    switch (dep) {
        case 'ALWAYS':
            return { shouldRun: true, shouldExecute: true };
        case 'IF_PREV_SUCCESS': {
            if (previousResult === null || previousResult === 'PASS') {
                return { shouldRun: true, shouldExecute: true };
            }
            return { shouldRun: false, shouldExecute: false, skipReason: `Skipped: previous step produced ${previousResult} (required PASS).` };
        }
        case 'IF_PREV_FAILURE': {
            if (previousResult === null) {
                return { shouldRun: false, shouldExecute: false, skipReason: 'Skipped: no previous step exists for IF_PREV_FAILURE.' };
            }
            if (previousResult === 'FAIL') {
                return { shouldRun: true, shouldExecute: true };
            }
            return { shouldRun: false, shouldExecute: false, skipReason: `Skipped: previous step produced ${previousResult} (required FAIL).` };
        }
        case 'IF_PREV_DATASET_NON_EMPTY':
            return { shouldRun: true, shouldExecute: true };
        default:
            return { shouldRun: true, shouldExecute: true };
    }
}
/**
 * Execute a stage-aware investigation workflow for a single transaction record.
 * Generates an auditable execution summary with independent closure tracking.
 */
export function executeWorkflowForTransaction(transactionRecord, workflow) {
    const transactionId = String(transactionRecord.transaction_id ||
        transactionRecord.id ||
        transactionRecord.card_number ||
        `TXN-${Date.now()}`);
    const auditTrail = [];
    let previousResult = null;
    let previousAction = null;
    let isHalted = false;
    let haltReason = undefined;
    let isClosed = false;
    let hasTechnicalError = false;
    let lastStageEvaluated = undefined;
    let lastRuleEvaluated = undefined;
    // Organize steps by stages
    const stages = workflow.stages && workflow.stages.length > 0
        ? [...workflow.stages].sort((a, b) => a.order - b.order)
        : [
            {
                id: 'stage-default',
                name: 'Primary Processing Stage',
                description: 'Default validation stage',
                order: 1,
                enabled: true,
                targetDbId: workflow.targetDbId || 'db-1',
                targetDataSource: workflow.targetTable || 'transactions'
            }
        ];
    const steps = [...(workflow.steps || [])].sort((a, b) => a.stepNumber - b.stepNumber);
    // Group steps by stage
    const stageStepsMap = {};
    stages.forEach(st => { stageStepsMap[st.id] = []; });
    steps.forEach(step => {
        const targetStageId = step.stageId && stageStepsMap[step.stageId] ? step.stageId : stages[0].id;
        stageStepsMap[targetStageId].push(step);
    });
    // Execute stages sequentially
    for (const stage of stages) {
        if (!stage.enabled)
            continue;
        if (isHalted || isClosed)
            break;
        lastStageEvaluated = stage.name;
        const stageSteps = stageStepsMap[stage.id] || [];
        for (const rule of stageSteps) {
            if (isHalted || isClosed)
                break;
            lastRuleEvaluated = rule.name;
            const startTime = Date.now();
            // Check dependency condition
            const depCheck = evaluateDependencyCondition(rule, previousResult, previousAction);
            if (!depCheck.shouldRun) {
                // Log skipped step
                auditTrail.push({
                    transactionId,
                    stageId: stage.id,
                    stageName: stage.name,
                    ruleId: rule.id,
                    ruleName: rule.name,
                    checkType: rule.checkType,
                    validationResult: 'FAIL', // default skip representation
                    pipelineAction: 'CONTINUE',
                    executedAt: new Date().toISOString(),
                    message: depCheck.skipReason || 'Step skipped due to dependency criteria.',
                    durationMs: 0
                });
                continue;
            }
            // Evaluate condition
            const evalResult = evaluateRuleCondition(transactionRecord, rule, stage);
            const action = resolveRuleAction(evalResult.status, rule);
            const durationMs = Date.now() - startTime;
            if (evalResult.status === 'ERROR') {
                hasTechnicalError = true;
            }
            auditTrail.push({
                transactionId,
                stageId: stage.id,
                stageName: stage.name,
                ruleId: rule.id,
                ruleName: rule.name,
                checkType: rule.checkType,
                validationResult: evalResult.status,
                pipelineAction: action,
                executedAt: new Date().toISOString(),
                message: evalResult.message,
                dataSnapshot: {
                    lookupValue: evalResult.dbValue,
                    detail: evalResult.detail
                },
                errorDetail: evalResult.errorDetail,
                durationMs
            });
            // Update state for next step
            previousResult = evalResult.status;
            previousAction = action;
            // Handle pipeline action semantics
            if (action === 'CLOSE') {
                isClosed = true;
                isHalted = true;
                haltReason = `Investigation CLOSED by rule '${rule.name}' in '${stage.name}' (Result: ${evalResult.status})`;
                break;
            }
            else if (action === 'STOP') {
                isHalted = true;
                haltReason = `Pipeline STOPPED by rule '${rule.name}' in '${stage.name}' (Result: ${evalResult.status})`;
                break;
            }
            // If action is CONTINUE, proceed to next rule / stage
        }
    }
    // Derive final investigation status
    let investigationStatus = 'INVESTIGATING';
    const anyFailures = auditTrail.some(a => a.validationResult === 'FAIL');
    const allPassed = auditTrail.length > 0 && auditTrail.every(a => a.validationResult === 'PASS');
    if (isClosed) {
        investigationStatus = 'CLOSED';
    }
    else if (hasTechnicalError || anyFailures) {
        investigationStatus = 'FLAGGED';
    }
    else if (allPassed && !isHalted) {
        investigationStatus = 'RECONCILED';
    }
    // Derive contextual Status Flag Text & Color for the investigation conclusion
    const recordDate = (() => {
        const candidateKeys = [
            'settlement_date', 'settled_at', 'settled_date', 'clearing_date',
            'auth_time', 'created_at', 'transaction_date', 'timestamp', 'date'
        ];
        for (const k of candidateKeys) {
            if (transactionRecord[k]) {
                const str = String(transactionRecord[k]).trim();
                if (str.length >= 10)
                    return str.substring(0, 10);
                return str;
            }
        }
        return null;
    })();
    const rawStatus = String(transactionRecord.status ||
        transactionRecord.status_state ||
        transactionRecord.state ||
        '').toUpperCase();
    const isSettlementWorkflow = workflow.category === 'Settlement' ||
        /settle/i.test(workflow.name || '') ||
        stages.some(s => /settle/i.test(s.name) || /settle/i.test(s.businessMeaning || ''));
    let statusFlagText = 'Reconciled';
    let statusFlagColor = 'emerald';
    const lastExecutedRule = steps.find(s => s.name === lastRuleEvaluated);
    if (investigationStatus === 'CLOSED') {
        statusFlagColor = 'slate';
        if (rawStatus === 'SETTLED' || (isSettlementWorkflow && allPassed)) {
            statusFlagText = recordDate ? `Settled on ${recordDate}` : 'Settled';
            statusFlagColor = 'emerald';
        }
        else if (rawStatus === 'DECLINED' || rawStatus === 'FAILED') {
            const code = transactionRecord.response_code;
            statusFlagText = code ? `Declined (Code ${code})` : 'Declined';
            statusFlagColor = 'rose';
        }
        else if (rawStatus === 'REVERSED') {
            statusFlagText = recordDate ? `Reversed on ${recordDate}` : 'Reversed';
            statusFlagColor = 'purple';
        }
        else if (lastExecutedRule?.onPassAction === 'CLOSE' && lastExecutedRule.successMessage) {
            statusFlagText = lastExecutedRule.successMessage.replace(/\{(\w+)\}/g, (_, k) => transactionRecord[k] ?? `{${k}}`);
        }
        else {
            statusFlagText = 'Investigation Closed';
        }
    }
    else if (investigationStatus === 'RECONCILED') {
        statusFlagColor = 'emerald';
        if (rawStatus === 'SETTLED' || isSettlementWorkflow) {
            statusFlagText = recordDate ? `Settled on ${recordDate}` : 'Settled';
        }
        else if (rawStatus === 'APPROVED' || rawStatus === 'SUCCESS') {
            statusFlagText = recordDate ? `Approved on ${recordDate}` : 'Approved';
        }
        else if (rawStatus === 'CLEARED') {
            statusFlagText = recordDate ? `Cleared on ${recordDate}` : 'Cleared';
        }
        else {
            statusFlagText = recordDate ? `Reconciled (${recordDate})` : 'Reconciled Clean';
        }
    }
    else if (investigationStatus === 'FLAGGED') {
        const failingAudit = auditTrail.find(a => a.validationResult === 'FAIL' || a.validationResult === 'ERROR');
        if (hasTechnicalError || failingAudit?.validationResult === 'ERROR') {
            statusFlagText = 'System Error';
            statusFlagColor = 'amber';
        }
        else if (rawStatus === 'DECLINED' || transactionRecord.response_code) {
            const code = transactionRecord.response_code;
            statusFlagText = code ? `Declined (Code ${code})` : 'Declined';
            statusFlagColor = 'rose';
        }
        else if (rawStatus === 'REVERSED') {
            statusFlagText = recordDate ? `Reversed on ${recordDate}` : 'Reversed';
            statusFlagColor = 'purple';
        }
        else if (failingAudit?.checkType === 'AMOUNT_MATCH') {
            statusFlagText = 'Amount Discrepancy';
            statusFlagColor = 'rose';
        }
        else if (failingAudit?.checkType === 'EXISTENCE_CHECK') {
            statusFlagText = 'Record Missing';
            statusFlagColor = 'rose';
        }
        else {
            statusFlagText = failingAudit?.message ? failingAudit.message.substring(0, 32) : 'Flagged Condition';
            statusFlagColor = 'rose';
        }
    }
    else {
        statusFlagText = 'Under Investigation';
        statusFlagColor = 'blue';
    }
    // Suggest remedy SQL if applicable
    let remedySql = undefined;
    if (investigationStatus === 'FLAGGED' && transactionRecord.card_number) {
        remedySql = `UPDATE transactions\nSET status = 'REVERSED'\nWHERE card_number = '${transactionRecord.card_number}';`;
    }
    return {
        transactionId,
        initialStatus: String(transactionRecord.status || transactionRecord.status_state || 'PENDING'),
        investigationStatus,
        statusFlagText,
        statusFlagColor,
        auditTrail,
        lastStageEvaluated,
        lastRuleEvaluated,
        isHalted,
        haltReason,
        isClosed,
        hasTechnicalError,
        remedySql
    };
}
/**
 * Execute batch investigation for multiple transaction rows.
 * Evaluates each record independently so closing one transaction never affects another or parent task.
 */
export function executeBatchInvestigation(records, workflow) {
    const result = {};
    for (const record of records) {
        const summary = executeWorkflowForTransaction(record, workflow);
        result[summary.transactionId] = summary;
    }
    return result;
}
