/**
 * ConditionCheckMethod — §6.4 CONDITION_CHECK Validation Method
 *
 * Operational Goal: Local in-memory attribute predicate evaluation.
 * Conforms strictly to §2.1 & §2.7:
 *   - Local evaluation on input fields and upstream producedValues.
 *   - Zero external database I/O.
 *   - Returns pure ValidationDataResult; verdict decided by ReconciliationEngine.
 *
 * @see RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md §2.7, §6.4
 */
export class ConditionCheckMethod {
    id;
    targetDbId;
    targetTable;
    requiredInputKeys;
    constructor(step) {
        this.id = step.id;
        this.targetDbId = step.targetDbId || undefined;
        this.targetTable = step.targetTable || undefined;
        // Derived from canonicalField, sourceField, targetField, or requiredParams
        const candidateKeys = [
            step.canonicalField,
            step.sourceField,
            step.targetField,
            ...(step.requiredParams ?? []),
        ].filter(Boolean);
        this.requiredInputKeys = Array.from(new Set(candidateKeys));
    }
    async execute(context, inputs) {
        // CONDITION_CHECK operates on local inputs and context initialRecord
        const localData = {
            ...inputs,
            ...(context.initialRecord?.canonical_data ?? context.initialRecord ?? {}),
        };
        return {
            context,
            mirrorTable: '',
            fetchedRowCount: 1,
            rawRows: [localData],
        };
    }
}
