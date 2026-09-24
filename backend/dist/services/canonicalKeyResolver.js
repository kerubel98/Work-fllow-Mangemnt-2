/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Standard candidate key names in priority order
 */
export const STANDARD_CANDIDATE_KEYS = [
    'transaction_id',
    'transactionId',
    'txn_id',
    'tx_id',
    'refnum',
    'fe_utrnno',
    'rrn',
    'hpan',
    'id'
];
/**
 * Hierarchical key discovery strictly following Rule 9 of AGENTS.md:
 * Table Overrides > Validation Box Required Keys > Global Standard Directory
 */
export function resolveCanonicalKey(options) {
    const { explicitKey, workflow, stage, queryExtraction, transactions, dbTableMappings, strictFailFast = false } = options;
    // 1. Explicit caller override
    if (explicitKey && explicitKey.trim()) {
        return {
            primaryKey: explicitKey.trim(),
            correlationKeys: [explicitKey.trim()],
            sourcePrecedence: 'EXPLICIT_OVERRIDE',
            isResolved: true
        };
    }
    // 2. Database Table Configuration Overrides (Rule 9 Precedence #1)
    if (stage && dbTableMappings && stage.targetDataSource) {
        const tableMapping = dbTableMappings[stage.targetDataSource];
        if (tableMapping?.primaryKey) {
            const pk = String(tableMapping.primaryKey).trim();
            return {
                primaryKey: pk,
                correlationKeys: [pk],
                sourcePrecedence: 'TABLE_CONFIG_OVERRIDE',
                isResolved: true
            };
        }
    }
    // 3. Validation Box Key Mappings (Rule 9 Precedence #2)
    if (queryExtraction?.keyMappings && queryExtraction.keyMappings.length > 0) {
        const mappedKeys = queryExtraction.keyMappings
            .filter(km => km.sourceField && km.sourceField.trim())
            .map(km => km.sourceField.trim());
        if (mappedKeys.length > 0) {
            return {
                primaryKey: mappedKeys[0],
                correlationKeys: mappedKeys,
                sourcePrecedence: 'VALIDATION_BOX_MAPPING',
                isResolved: true
            };
        }
    }
    // Check stage rules for primary sourceField or requiredParams
    if (stage && workflow?.rules) {
        const stageRules = workflow.rules.filter(r => r.stageId === stage.id);
        for (const rule of stageRules) {
            if (rule.sourceField && STANDARD_CANDIDATE_KEYS.includes(rule.sourceField.toLowerCase())) {
                return {
                    primaryKey: rule.sourceField.trim(),
                    correlationKeys: [rule.sourceField.trim()],
                    sourcePrecedence: 'VALIDATION_BOX_MAPPING',
                    isResolved: true
                };
            }
        }
    }
    // 4. Inspect active transaction dataset (Rule 9 Precedence #3)
    if (Array.isArray(transactions) && transactions.length > 0) {
        const firstRow = transactions[0] || {};
        const availableKeys = Object.keys(firstRow);
        // Exact match against standard keys
        for (const candidate of STANDARD_CANDIDATE_KEYS) {
            const match = availableKeys.find(k => k.toLowerCase() === candidate.toLowerCase());
            if (match) {
                return {
                    primaryKey: match,
                    correlationKeys: [match],
                    sourcePrecedence: 'DATASET_MATCH',
                    isResolved: true
                };
            }
        }
        // Check if any key contains "id", "ref", "num"
        const fallbackMatch = availableKeys.find(k => k.toLowerCase().endsWith('_id') ||
            k.toLowerCase().endsWith('id') ||
            k.toLowerCase().includes('ref'));
        if (fallbackMatch) {
            return {
                primaryKey: fallbackMatch,
                correlationKeys: [fallbackMatch],
                sourcePrecedence: 'DATASET_MATCH',
                isResolved: true
            };
        }
    }
    // 5. Fail-fast if requested, otherwise return explicit fallback warning
    if (strictFailFast) {
        throw new Error(`[CanonicalKeyResolver] Unable to determine primary correlation key for workflow '${workflow?.name || workflow?.id || 'unknown'}'. Please configure an explicit key in DB table mapping or validation box.`);
    }
    return {
        primaryKey: 'transaction_id',
        correlationKeys: ['transaction_id'],
        sourcePrecedence: 'FALLBACK',
        isResolved: false,
        warning: 'Could not resolve correlation key from metadata. Fell back to default identifier.'
    };
}
/**
 * Validates whether all transactions in a dataset have the resolved key.
 */
export function validateDatasetKeys(transactions, primaryKey) {
    if (!Array.isArray(transactions) || transactions.length === 0) {
        return { isValid: false, missingCount: 0, warning: 'Dataset is empty.' };
    }
    const missing = transactions.filter(t => {
        const val = t[primaryKey];
        return val === undefined || val === null || String(val).trim() === '';
    });
    return {
        isValid: missing.length === 0,
        missingCount: missing.length,
        warning: missing.length > 0
            ? `${missing.length} transactions lack the designated primary key '${primaryKey}'.`
            : undefined
    };
}
