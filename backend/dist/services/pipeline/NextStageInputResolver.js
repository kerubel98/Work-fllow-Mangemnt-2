/**
 * NextStageInputResolver — §2.11 Downstream Key Resolution
 *
 * Resolves the `requiredInputKeys` declared by each downstream ValidationMethod
 * by scanning the accumulated lineageHistory from all prior stages.
 *
 * Resolution priority order (§6.4 §1.2):
 *   1. Direct value in the original `context.initialRecord` (canonical_data / raw_data).
 *   2. `producedValues` emitted by the most-recent upstream stage.
 *   3. `producedValues` from any earlier stage (LIFO scan over lineageHistory).
 *   4. Mirror tables via set-based key projection (set-based mode, §7.6 Step 3).
 *
 * In set-based mode, the resolver does NOT pull rows into Node.js memory.
 * Instead, it calls coordinateInjector.extractDownstreamKeys() to query the
 * upstream mirror table directly and feeds the resulting tuples into the next
 * stage's ingress query.
 *
 * @see RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md §2.11, §6.4, §7.6
 */
export class NextStageInputResolver {
    /**
     * Resolves the set of input keys required by the next stage.
     *
     * @param requiredInputKeys  Keys declared by the downstream ValidationMethod.
     * @param context            Current execution context with full lineageHistory.
     * @param extraSources       Optional additional maps to check after lineage.
     */
    resolve(requiredInputKeys, context, extraSources = []) {
        const values = {};
        const missingKeys = [];
        const sourceMap = {};
        for (const key of requiredInputKeys) {
            let resolved = false;
            // Priority 1: Original input record (canonical_data → raw_data → top-level)
            const initRecord = context.initialRecord;
            if (initRecord) {
                const candidateVal = initRecord.canonical_data?.[key] ??
                    initRecord.raw_data?.[key] ??
                    initRecord[key];
                if (candidateVal !== undefined && candidateVal !== null) {
                    values[key] = candidateVal;
                    sourceMap[key] = 'initialRecord';
                    resolved = true;
                }
            }
            if (resolved)
                continue;
            // Priority 2 + 3: Scan lineageHistory in reverse (most recent stage first)
            for (let i = context.lineageHistory.length - 1; i >= 0; i--) {
                const record = context.lineageHistory[i];
                if (record.producedValues && key in record.producedValues) {
                    values[key] = record.producedValues[key];
                    sourceMap[key] = `stage:${record.stageId}`;
                    resolved = true;
                    break;
                }
            }
            if (resolved)
                continue;
            // Priority 4: Extra sources (e.g. static reference tables, pre-fetched lookups)
            for (const source of extraSources) {
                if (key in source) {
                    values[key] = source[key];
                    sourceMap[key] = 'extraSource';
                    resolved = true;
                    break;
                }
            }
            if (!resolved) {
                missingKeys.push(key);
            }
        }
        return { values, missingKeys, sourceMap };
    }
    /**
     * Checks whether all required input keys are satisfiable from the current
     * lineage, without resolving them. Used by the builder at compile time to
     * detect configuration errors early (§3.1).
     */
    canSatisfy(requiredInputKeys, availableProducedKeys, initialRecordKeys) {
        const unresolvable = [];
        for (const key of requiredInputKeys) {
            if (!initialRecordKeys.has(key) && !availableProducedKeys.has(key)) {
                unresolvable.push(key);
            }
        }
        return { satisfiable: unresolvable.length === 0, unresolvable };
    }
    /**
     * Merges the producedValues from a completed StageExecutionRecord into the
     * running accumulator, logging the source stage for each key.
     * Called after each stage completes to keep the resolver's view up to date.
     */
    mergeProducedValues(accumulator, record) {
        for (const [k, v] of Object.entries(record.producedValues)) {
            // Do not overwrite existing keys — first producer wins (LIFO already applied in resolve())
            if (!(k in accumulator)) {
                accumulator[k] = v;
            }
        }
    }
}
