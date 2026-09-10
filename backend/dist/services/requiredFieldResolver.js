/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/**
 * Automatically inspects the rules configured for a stage (or whole workflow)
 * and resolves precisely which columns are required by rules and key correlation.
 * Prevents "SELECT *" across hundreds of external columns.
 */
export function resolveRequiredColumnsForStage(stage, rules, existingExtraction) {
    const columnMap = new Map();
    const warnings = [];
    // Filter rules assigned to this stage
    const stageRules = rules.filter(r => (r.stageId || '') === stage.id);
    for (const rule of stageRules) {
        // 1. Primary sourceField
        if (rule.sourceField && rule.sourceField.trim()) {
            const col = rule.sourceField.trim();
            if (!columnMap.has(col)) {
                columnMap.set(col, { usedByRuleIds: new Set(), required: true });
            }
            columnMap.get(col).usedByRuleIds.add(rule.id);
        }
        // 2. targetField in comparisons
        if (rule.targetField && rule.targetField.trim()) {
            const col = rule.targetField.trim();
            if (!columnMap.has(col)) {
                columnMap.set(col, { usedByRuleIds: new Set(), required: true });
            }
            columnMap.get(col).usedByRuleIds.add(rule.id);
        }
        // 3. Mandatory requiredParams
        if (Array.isArray(rule.requiredParams)) {
            for (const p of rule.requiredParams) {
                if (p && p.trim()) {
                    const col = p.trim();
                    if (!columnMap.has(col)) {
                        columnMap.set(col, { usedByRuleIds: new Set(), required: true });
                    }
                    columnMap.get(col).usedByRuleIds.add(rule.id);
                }
            }
        }
        // 4. Optional params
        if (Array.isArray(rule.optionalParams)) {
            for (const p of rule.optionalParams) {
                if (p && p.trim()) {
                    const col = p.trim();
                    if (!columnMap.has(col)) {
                        columnMap.set(col, { usedByRuleIds: new Set(), required: false });
                    }
                    columnMap.get(col).usedByRuleIds.add(rule.id);
                }
            }
        }
        // 5. Lookups inside custom SQL condition or raw queries (e.g. :col_name or {col_name})
        if (rule.sqlCondition) {
            const sqlParamMatches = rule.sqlCondition.match(/[:{]([a-zA-Z0-9_]+)[}]?/g);
            if (sqlParamMatches) {
                for (const rawMatch of sqlParamMatches) {
                    const cleaned = rawMatch.replace(/[:{}]/g, '').trim();
                    if (cleaned && !['transaction_id', 'id'].includes(cleaned.toLowerCase())) {
                        if (!columnMap.has(cleaned)) {
                            columnMap.set(cleaned, { usedByRuleIds: new Set(), required: true });
                        }
                        columnMap.get(cleaned).usedByRuleIds.add(rule.id);
                    }
                }
            }
        }
    }
    // Always include key correlation fields if configured in extraction
    if (existingExtraction?.keyMappings) {
        for (const km of existingExtraction.keyMappings) {
            if (km.sourceField && !columnMap.has(km.sourceField)) {
                columnMap.set(km.sourceField, { usedByRuleIds: new Set(['key-mapping']), required: km.required });
            }
        }
    }
    // Build resolved QueryColumn array
    const requiredColumns = Array.from(columnMap.entries()).map(([col, meta]) => ({
        sourceColumn: col,
        required: meta.required,
        usedByRuleIds: Array.from(meta.usedByRuleIds)
    }));
    // If an existing extraction is provided, check for missing fields
    const missingFromExtraction = [];
    if (existingExtraction) {
        const extractedColNames = new Set(existingExtraction.selectedColumns.map((c) => c.sourceColumn.toLowerCase()));
        for (const col of requiredColumns) {
            if (col.required && !extractedColNames.has(col.sourceColumn.toLowerCase())) {
                missingFromExtraction.push(col.sourceColumn);
                warnings.push(`Rule(s) [${col.usedByRuleIds.join(', ')}] require column '${col.sourceColumn}', but it is missing from QueryExtraction for stage '${stage.name}'`);
            }
        }
    }
    return {
        stageId: stage.id,
        stageName: stage.name,
        targetDbId: stage.targetDbId,
        targetDataSource: stage.targetDataSource,
        requiredColumns,
        missingFromExtraction: missingFromExtraction.length > 0 ? missingFromExtraction : undefined,
        warnings
    };
}
/**
 * Resolves required columns across all stages for an entire workflow.
 */
export function resolveRequiredColumnsForWorkflow(workflow, extractions = []) {
    const result = {};
    const stages = workflow.stages || [];
    const rules = workflow.steps || [];
    for (const stage of stages) {
        const stageExtraction = extractions.find(e => e.stageId === stage.id || (e.workflowId === workflow.id && !e.stageId));
        result[stage.id] = resolveRequiredColumnsForStage(stage, rules, stageExtraction);
    }
    return result;
}
