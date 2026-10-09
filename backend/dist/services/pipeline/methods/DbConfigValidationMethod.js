/**
 * DbConfigValidationMethod — §6.7 DB Column Configuration Validation Method
 *
 * Operational Goal: Evaluates table-level rules (Completeness, Value Range, Pattern,
 * Duplicates, Grouping) directly on returned external data (multi-leg array in returned_data)
 * or local canonical data.
 *
 * Conforms strictly to Architecture Specification:
 *   - Runs LAST in the stage after mirror reconciliation is completed.
 *   - Operates strictly on passed rows.
 *   - Supports MUTATE_STATUS (fails record on breach) and REPORT_ONLY (records diagnostic details without changing PASS).
 *   - Attaches dataKeys list to the evaluation detail for forensic audit.
 */
export class DbConfigValidationMethod {
    id;
    name;
    config;
    stageNumber;
    targetDbId;
    targetTable;
    statusBehavior;
    affectsReconciliationStatus;
    requiredInputKeys;
    constructor(config, stageNumber, targetDbId, targetTable) {
        this.id = `colcfg-method-${config.id}`;
        this.name = config.name;
        this.config = config;
        this.stageNumber = stageNumber;
        this.targetDbId = targetDbId || config.dbId;
        this.targetTable = targetTable || config.tableName;
        this.statusBehavior = config.statusBehavior || 'MUTATE_STATUS';
        this.affectsReconciliationStatus = config.affectsReconciliationStatus !== false;
        const candidateKeys = [];
        if (Array.isArray(config.columns)) {
            for (const col of config.columns) {
                if (col.columnName)
                    candidateKeys.push(col.columnName);
            }
        }
        if (config.primaryKeyColumn)
            candidateKeys.push(config.primaryKeyColumn);
        if (config.roleColumn)
            candidateKeys.push(config.roleColumn);
        if (Array.isArray(config.groupByColumns))
            candidateKeys.push(...config.groupByColumns);
        this.requiredInputKeys = Array.from(new Set(candidateKeys));
    }
    async execute(context, inputs) {
        const workflowId = context.workflowId || 'default';
        const targetTable = this.targetTable || '';
        // Downstream validators and DB configs pull directly from returned_data in task_dataset_transactions
        const returnedData = context.initialRecord?.returned_data || context.initialRecord?.canonical_data?.returned_data || {};
        const workflowData = returnedData[workflowId] || returnedData;
        const rawLegs = workflowData[targetTable] || returnedData[targetTable];
        const returnedLegs = Array.isArray(rawLegs) ? rawLegs : (rawLegs ? [rawLegs] : []);
        const effectiveRows = returnedLegs.length > 0
            ? returnedLegs
            : (Array.isArray(context._stagedRows) ? context._stagedRows : [inputs]);
        return {
            context,
            mirrorTable: '',
            fetchedRowCount: effectiveRows.length,
            rawRows: effectiveRows,
        };
    }
    /**
     * Forensic rule evaluation logic for DatabaseColumnConfiguration
     */
    evaluateConfig(candidateRows, canonicalRow) {
        const cfg = this.config;
        const dataKeys = this.requiredInputKeys;
        const targetRows = candidateRows.length > 0 ? candidateRows : [canonicalRow];
        // Evaluate Multi-Leg Duplicate Check / Uniqueness constraints across returned rows
        if (cfg.ruleType === 'DUPLICATE_CHECK' || cfg.ruleType === 'UNIQUE_CONSTRAINT') {
            let matchingRows = targetRows;
            if (Array.isArray(cfg.filterConditions) && cfg.filterConditions.length > 0) {
                matchingRows = targetRows.filter(row => {
                    return cfg.filterConditions.every(fc => {
                        const rowVal = String(row[fc.columnName] ?? '').trim().toLowerCase();
                        const condVal = String(fc.value ?? '').trim().toLowerCase();
                        switch (fc.operator) {
                            case '=': return rowVal === condVal;
                            case '!=': return rowVal !== condVal;
                            case 'LIKE': return rowVal.includes(condVal);
                            case 'STARTS_WITH': return rowVal.startsWith(condVal);
                            case '>': return Number(rowVal) > Number(condVal);
                            case '>=': return Number(rowVal) >= Number(condVal);
                            case '<': return Number(rowVal) < Number(condVal);
                            case '<=': return Number(rowVal) <= Number(condVal);
                            case 'IN': return condVal.split(',').map(s => s.trim()).includes(rowVal);
                            case 'NOT_IN': return !condVal.split(',').map(s => s.trim()).includes(rowVal);
                            default: return rowVal === condVal;
                        }
                    });
                });
            }
            const op = String(cfg.aggregationRules?.[0]?.operator || '>').trim();
            const threshold = Number(cfg.aggregationRules?.[0]?.value ?? 1);
            const isExpectedEq = op === '=' || op === '==';
            let isViolation = false;
            const count = matchingRows.length;
            if (count <= 1) {
                if (isExpectedEq && threshold === 1)
                    isViolation = false;
                else if (op === '>' || op === '>=')
                    isViolation = false;
                else if (count === 0 && isExpectedEq && threshold > 0)
                    isViolation = false;
            }
            else {
                if (isExpectedEq)
                    isViolation = (count !== threshold);
                else if (op === '>')
                    isViolation = (count > threshold);
                else if (op === '>=')
                    isViolation = (count >= threshold);
                else
                    isViolation = (count > 1);
            }
            if (isViolation) {
                const idCol = cfg.columns?.[0]?.columnName || cfg.primaryKeyColumn || cfg.groupByColumns?.[0] || 'id';
                const idVal = matchingRows[0]?.[idCol] ?? canonicalRow[idCol] ?? 'UNKNOWN';
                return {
                    status: 'FAIL',
                    message: cfg.violationMessage || `Duplicate Check failed on [${cfg.name}]: detected ${count} matching legs for identifier [${idCol}=${idVal}].`,
                    details: {
                        rule: cfg.name,
                        ruleType: cfg.ruleType,
                        identifierColumn: idCol,
                        identifierValue: idVal,
                        duplicateCount: count,
                        matchingLegs: matchingRows
                    },
                    dataKeys,
                    action: cfg.violationAction || 'FLAG'
                };
            }
        }
        for (const row of targetRows) {
            if (cfg.ruleType === 'COMPLETENESS_CHECK') {
                const missing = [];
                for (const col of (cfg.columns || [])) {
                    const v = row[col.columnName] ?? canonicalRow[col.columnName];
                    if (v === undefined || v === null || String(v).trim() === '') {
                        missing.push(col.columnName);
                    }
                }
                if (missing.length > 0) {
                    return {
                        status: 'FAIL',
                        message: cfg.violationMessage || `Completeness Check failed on [${cfg.name}]: columns [${missing.join(', ')}] missing.`,
                        details: { missingColumns: missing, rule: cfg.name, ruleType: cfg.ruleType },
                        dataKeys,
                        action: cfg.violationAction || 'FLAG'
                    };
                }
            }
            else if (cfg.ruleType === 'VALUE_RANGE_CHECK') {
                for (const col of (cfg.columns || [])) {
                    const v = row[col.columnName] ?? canonicalRow[col.columnName];
                    if (v !== undefined && v !== null && String(v).trim() !== '') {
                        const num = Number(v);
                        if (!isNaN(num)) {
                            if (col.minValue !== undefined && num < Number(col.minValue)) {
                                return {
                                    status: 'FAIL',
                                    message: cfg.violationMessage || `Value Range Check failed on [${cfg.name}]: '${col.columnName}' (${num}) < ${col.minValue}.`,
                                    details: { column: col.columnName, value: num, minValue: col.minValue, rule: cfg.name },
                                    dataKeys,
                                    action: cfg.violationAction || 'FLAG'
                                };
                            }
                            if (col.maxValue !== undefined && num > Number(col.maxValue)) {
                                return {
                                    status: 'FAIL',
                                    message: cfg.violationMessage || `Value Range Check failed on [${cfg.name}]: '${col.columnName}' (${num}) > ${col.maxValue}.`,
                                    details: { column: col.columnName, value: num, maxValue: col.maxValue, rule: cfg.name },
                                    dataKeys,
                                    action: cfg.violationAction || 'FLAG'
                                };
                            }
                        }
                    }
                }
            }
            else if (cfg.ruleType === 'PATTERN_CHECK') {
                for (const col of (cfg.columns || [])) {
                    const v = row[col.columnName] ?? canonicalRow[col.columnName];
                    if (col.pattern && v !== undefined && v !== null && String(v).trim() !== '') {
                        try {
                            const regex = new RegExp(col.pattern);
                            if (!regex.test(String(v))) {
                                return {
                                    status: 'FAIL',
                                    message: cfg.violationMessage || `Pattern Check failed on [${cfg.name}]: '${col.columnName}' does not match pattern ${col.pattern}.`,
                                    details: { column: col.columnName, value: v, pattern: col.pattern, rule: cfg.name },
                                    dataKeys,
                                    action: cfg.violationAction || 'FLAG'
                                };
                            }
                        }
                        catch {
                            // Ignore invalid regex
                        }
                    }
                }
            }
        }
        return {
            status: 'PASS',
            message: `Table rule [${cfg.name}] satisfied.`,
            details: { rule: cfg.name, ruleType: cfg.ruleType },
            dataKeys,
            action: 'CONTINUE'
        };
    }
}
