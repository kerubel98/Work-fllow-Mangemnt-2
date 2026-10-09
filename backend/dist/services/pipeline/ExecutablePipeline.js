/**
 * ExecutablePipeline — §2.10 Executable Pipeline Orchestrator
 *
 * Sequences executable stages in topological order, handles deterministic
 * STOP/CLOSE halting, applies diagnostic taint on FAIL+CONTINUE, and
 * produces a complete PipelineExecutionReport with full lineage audit trail.
 *
 * This class is the runtime heart of the pipeline. It:
 *   1. Receives a pre-compiled list of ExecutableStage instances from WorkflowPipelineBuilder.
 *   2. Sequences them in topological order (Kahn's sort already done by builder).
 *   3. Calls NextStageInputResolver between every stage transition.
 *   4. Calls ReconciliationEngine.reconcileRow() after each ValidationMethod.execute().
 *   5. Appends each StageExecutionRecord to context.lineageHistory (immutable §2.12).
 *   6. Halts deterministically when pipelineAction is STOP or CLOSE.
 *   7. In batch (set-based) mode, delegates to reconcileSet() and coordinateInjector.
 *
 * §4.2 Corrections:
 *   - STRICT_SINGLE breach is reported — never sliced.
 *   - FAIL + CONTINUE = diagnostic taint (Rule 12).
 *   - Verdict ≠ Action is maintained at every stage boundary.
 *
 * @see RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md §2.10, §4.2, §5.1, §7.2
 */
import { ReconciliationEngine } from './ReconciliationEngine.js';
import { NextStageInputResolver } from './NextStageInputResolver.js';
import { coordinateInjector } from './CoordinateInjector.js';
import { queryPg } from '../../config/postgres.js';
export class ExecutableStage {
    stageId;
    stageName;
    stageType;
    cardinalityPolicy;
    orderByColumn;
    validations;
    compiledRules;
    aggregationStrategy;
    attachedDbConfigIds;
    dbConfigMethods;
    constructor(stageId, stageName, stageType, cardinalityPolicy, orderByColumn, validations, compiledRules, aggregationStrategy, attachedDbConfigIds, dbConfigMethods) {
        this.stageId = stageId;
        this.stageName = stageName;
        this.stageType = stageType;
        this.cardinalityPolicy = cardinalityPolicy;
        this.orderByColumn = orderByColumn;
        this.validations = validations;
        this.compiledRules = compiledRules;
        this.aggregationStrategy = aggregationStrategy;
        this.attachedDbConfigIds = attachedDbConfigIds;
        this.dbConfigMethods = dbConfigMethods;
    }
    /**
     * Runs all ValidationMethods in this stage sequentially.
     * §2.7: Each method focuses on data retrieval; reconciliation is handled by
     * ReconciliationEngine after each method call.
     */
    async executeRow(context, inputs, reconciler) {
        const records = [];
        for (const method of this.validations) {
            // Update context for this specific validation method
            const methodCtx = {
                ...context,
                validationId: method.id,
                stageId: this.stageId,
                stageName: this.stageName,
            };
            // Acquire data (no verdict logic inside ValidationMethod)
            const dataResult = await method.execute(methodCtx, inputs);
            // Determine which rule applies to this method (matched by id/step reference)
            const rule = this.compiledRules.find(r => r.id === method.id) || this.compiledRules[0];
            if (!rule)
                continue;
            // Delegate verdict + action determination entirely to ReconciliationEngine
            const reconResult = await reconciler.reconcileRow(inputs, dataResult, {
                ...rule,
                cardinalityPolicy: this.cardinalityPolicy,
                aggregationStrategy: this.aggregationStrategy,
            }, methodCtx);
            records.push(reconResult.executionRecord);
        }
        // §6.7 DB Column Config execution:
        // Attached DB configs execute LAST in the stage after mirror reconciliation is completed,
        // operating strictly on passed rows.
        const allPassed = records.length > 0 && records.every(r => r.validationResult === 'PASS');
        if (allPassed && this.dbConfigMethods && this.dbConfigMethods.length > 0) {
            for (const colMethod of this.dbConfigMethods) {
                const colMethodCtx = {
                    ...context,
                    validationId: colMethod.id,
                    stageId: this.stageId,
                    stageName: this.stageName,
                };
                const dataResult = await colMethod.execute(colMethodCtx, inputs);
                const evalResult = colMethod.evaluateConfig(dataResult.rawRows, inputs);
                if (evalResult.status === 'FAIL') {
                    if (colMethod.statusBehavior === 'MUTATE_STATUS') {
                        records.push({
                            stageId: this.stageId,
                            stageName: this.stageName,
                            validationId: colMethod.id,
                            stepId: colMethod.id,
                            validationResult: 'FAIL',
                            pipelineAction: evalResult.action || 'FLAG',
                            cardinalityStatus: 'EXACT_MATCH',
                            isDiagnosticOnly: false,
                            producedValues: {},
                            evaluatedAt: new Date().toISOString(),
                            timestamp: new Date().toISOString(),
                            evaluationDetails: {
                                ...evalResult.details,
                                message: evalResult.message,
                                dataKeys: evalResult.dataKeys,
                                statusBehavior: 'MUTATE_STATUS',
                            },
                        });
                        if (evalResult.action === 'STOP' || evalResult.action === 'CLOSE') {
                            break;
                        }
                    }
                    else {
                        // REPORT_ONLY
                        records.push({
                            stageId: this.stageId,
                            stageName: this.stageName,
                            validationId: colMethod.id,
                            stepId: colMethod.id,
                            validationResult: 'PASS',
                            pipelineAction: 'CONTINUE',
                            cardinalityStatus: 'EXACT_MATCH',
                            isDiagnosticOnly: true,
                            producedValues: {},
                            evaluatedAt: new Date().toISOString(),
                            timestamp: new Date().toISOString(),
                            evaluationDetails: {
                                ...evalResult.details,
                                message: evalResult.message,
                                dataKeys: evalResult.dataKeys,
                                statusBehavior: 'REPORT_ONLY',
                                reportOnly: true,
                                violationReport: evalResult.message,
                            },
                        });
                    }
                }
                else {
                    // PASS
                    records.push({
                        stageId: this.stageId,
                        stageName: this.stageName,
                        validationId: colMethod.id,
                        stepId: colMethod.id,
                        validationResult: 'PASS',
                        pipelineAction: 'CONTINUE',
                        cardinalityStatus: 'EXACT_MATCH',
                        isDiagnosticOnly: false,
                        producedValues: {},
                        evaluatedAt: new Date().toISOString(),
                        timestamp: new Date().toISOString(),
                        evaluationDetails: {
                            ...evalResult.details,
                            message: evalResult.message,
                            dataKeys: evalResult.dataKeys,
                            statusBehavior: colMethod.statusBehavior,
                        },
                    });
                }
            }
        }
        return records;
    }
}
// ---------------------------------------------------------------------------
// ExecutablePipeline
// ---------------------------------------------------------------------------
export class ExecutablePipeline {
    workflowId;
    workflowName;
    stages;
    reconciler = new ReconciliationEngine();
    inputResolver = new NextStageInputResolver();
    constructor(workflowId, workflowName, stages) {
        this.workflowId = workflowId;
        this.workflowName = workflowName;
        this.stages = stages;
    }
    /**
     * Mode B: Interactive single-row pipeline execution.
     *
     * Sequences all stages in topological order, resolving inputs between each.
     * Halts deterministically on STOP or CLOSE actions (§2.10).
     *
     * @param context  Row execution context with lineageHistory initialized to [].
     * @returns        Complete pipeline report including full lineage.
     */
    async executeRow(context) {
        const t0 = Date.now();
        // Running accumulator of all produced values (merged across stages)
        const producedAccumulator = {};
        let finalResult = 'PASS';
        let finalAction = 'CONTINUE';
        for (const stage of this.stages) {
            // Resolve inputs required by this stage's methods
            const resolved = this.inputResolver.resolve(stage.validations.flatMap(v => v.requiredInputKeys), context);
            // Merge latest produced accumulator into resolved values
            const inputs = { ...producedAccumulator, ...resolved.values };
            // Execute all validation methods in this stage
            const stageRecords = await stage.executeRow(context, inputs, this.reconciler);
            for (const record of stageRecords) {
                // Append to immutable lineage (§2.12 — never overwrite)
                context.lineageHistory.push(record);
                // Merge produced values into running accumulator
                this.inputResolver.mergeProducedValues(producedAccumulator, record);
                // Upgrade finalResult/finalAction based on this record
                const verdict = record.validationResult;
                const action = record.pipelineAction;
                if (verdict === 'ERROR' || verdict === 'PAUSED_DB_OFFLINE') {
                    finalResult = verdict;
                    finalAction = action;
                }
                else if (verdict === 'FAIL' && finalResult === 'PASS') {
                    finalResult = 'FAIL';
                    finalAction = action;
                }
                // §2.10: Deterministic pipeline halt
                if (action === 'STOP' || action === 'CLOSE') {
                    finalAction = action;
                    return this._buildReport(context, finalResult, finalAction, t0);
                }
            }
        }
        return this._buildReport(context, finalResult, finalAction, t0);
    }
    /**
     * Mode A: Set-based batch pipeline execution.
     *
     * For each stage:
     *   1. CoordinateInjector fetches rows from external DB, stages into mirror.
     *   2. ReconciliationEngine.reconcileSet() runs single atomic UPDATE.
     *   3. Aggregate metrics collected from mirror COUNT query.
     *   4. Downstream keys bridged via coordinateInjector.extractDownstreamKeys().
     *   5. Halts if stoppedCount > 0 (STOP action fired on any row).
     *
     * §7.2, §7.6: No rows are pulled into Node.js memory between stages.
     *
     * @param batchCtx  Batch execution coordinates.
     * @param inputRows Ordered input rows from task_dataset_transactions.
     * @param dbLookup  Lookup function: dbId → DatabaseConnection.
     */
    async executeBatch(batchCtx, inputRows, dbLookup) {
        const t0 = Date.now();
        const stageResults = [];
        let totalPass = 0;
        let totalFail = 0;
        let currentRows = [...inputRows];
        const cumulativeRowOutcomes = new Map();
        for (let sIdx = 0; sIdx < this.stages.length; sIdx++) {
            const stage = this.stages[sIdx];
            // Use first validation method to determine the DB/table target
            const method = stage.validations[0];
            if (!method)
                continue;
            const db = method.targetDbId ? await dbLookup(method.targetDbId) : null;
            const targetTable = method.targetTable ?? '';
            let mirrorTable = '';
            // Stage I/O: Fetch external data and stage to mirror
            if (db && targetTable) {
                // Derive key mappings from rule keyMappings, searchParameters, or method requiredInputKeys
                const rule0 = stage.compiledRules[0];
                let keyMappings = rule0?.keyMappings ?? [];
                if (keyMappings.length === 0 && Array.isArray(rule0?.searchParameters) && rule0.searchParameters.length > 0) {
                    keyMappings = rule0.searchParameters.map((p) => ({
                        inputField: p.inputField,
                        sourceField: p.targetColumn || p.sourceField || p.inputField,
                    }));
                }
                if (keyMappings.length === 0 && method.requiredInputKeys.length > 0) {
                    keyMappings = method.requiredInputKeys.map(k => ({
                        inputField: k,
                        sourceField: k,
                    }));
                }
                if (keyMappings.length === 0 && (rule0?.inputField || rule0?.sourceField || rule0?.targetField)) {
                    const field = rule0.inputField || rule0.sourceField || rule0.targetField;
                    keyMappings = [{
                            inputField: field,
                            sourceField: rule0.targetField || field,
                        }];
                }
                if (keyMappings.length === 0) {
                    throw new Error(`[ExecutablePipeline] Configuration Error: Stage "${stage.stageName}" (${stage.stageId}) requires external query on "${targetTable}" but has no keyMappings, searchParameters, or requiredInputKeys configured.`);
                }
                const ingressResult = await coordinateInjector.ingestAndMirror(batchCtx.taskId, batchCtx.batchId, batchCtx.ruleBlockId, currentRows, keyMappings, db, targetTable);
                mirrorTable = ingressResult.mirrorTable;
            }
            else {
                // CONDITION_CHECK / REPORT — ensure mirror table exists and stage local rows for set-based SQL evaluation
                const { mirrorTableManager } = await import('../mirrorTableManager.js');
                mirrorTable = await mirrorTableManager.ensureMirrorTableExists(null, targetTable || stage.stageId);
                await mirrorTableManager.bulkInsertToMirror(mirrorTable, batchCtx.batchId, batchCtx.ruleBlockId, currentRows);
            }
            // Get physical mirror columns for SQL compiler
            const { mirrorTableManager } = await import('../mirrorTableManager.js');
            let mirrorCols = [];
            try {
                mirrorCols = await mirrorTableManager.getMirrorColumns(mirrorTable);
            }
            catch { /* non-fatal */ }
            // Reconcile the mirror set-based
            const stageCtx = {
                ...batchCtx,
                stageId: stage.stageId,
                stageName: stage.stageName,
            };
            const batchResult = await this.reconciler.reconcileSet(stageCtx, mirrorTable, stage.compiledRules, mirrorCols, {
                cardinalityPolicy: stage.cardinalityPolicy,
                aggregationStrategy: stage.aggregationStrategy,
                orderByColumn: stage.orderByColumn,
            });
            stageResults.push(batchResult);
            // If external search staged zero rows, all input rows are NO_MATCH -> FAIL
            const rule0 = stage.compiledRules[0];
            if (batchResult.totalEvaluated === 0 && currentRows.length > 0 && db && targetTable) {
                batchResult.totalEvaluated = currentRows.length;
                batchResult.failedCount = currentRows.length;
                totalFail += currentRows.length;
                for (const r of currentRows) {
                    const rNum = Number(r._row_number);
                    cumulativeRowOutcomes.set(rNum, {
                        rowNumber: rNum,
                        stageId: stage.stageId,
                        validationStatus: 'FAIL',
                        validationAction: rule0?.onFailAction || 'STOP',
                        details: {
                            existence: 'NOT_FOUND_IN_TARGET_DB',
                            reason: `No matching records found in ${targetTable}.`,
                        },
                        targetRecord: null,
                    });
                }
            }
            else {
                totalPass += batchResult.passedCount;
                totalFail += batchResult.failedCount;
                if (mirrorTable) {
                    try {
                        const mirrorOutcomeRes = await queryPg(`SELECT _row_number, _validation_status, _validation_action, _validation_details,
                      to_jsonb(m.*) - '_batch_id' - '_rule_block_id' - '_task_id' - '_row_number' - '_validation_status' - '_validation_action' - '_validation_details' AS target_record
               FROM ${mirrorTable} m
               WHERE _batch_id = $1 AND _rule_block_id = $2`, [batchCtx.batchId, batchCtx.ruleBlockId]);
                        const stagedRowNumbers = new Set();
                        const rowsByRowNum = new Map();
                        const metaByRowNum = new Map();
                        for (const r of mirrorOutcomeRes.rows || []) {
                            const rNum = Number(r._row_number);
                            stagedRowNumbers.add(rNum);
                            if (!rowsByRowNum.has(rNum)) {
                                rowsByRowNum.set(rNum, []);
                                metaByRowNum.set(rNum, r);
                            }
                            if (r.target_record) {
                                rowsByRowNum.get(rNum).push(r.target_record);
                            }
                        }
                        for (const [rNum, targetRows] of rowsByRowNum.entries()) {
                            const rMeta = metaByRowNum.get(rNum);
                            let valStatus = (rMeta._validation_status || 'PASS');
                            let valAction = (rMeta._validation_action || 'CONTINUE');
                            let valDetails = rMeta._validation_details || {};
                            // If stage has attached dbConfigMethods, evaluate on passed rows across all candidate legs
                            if (valStatus === 'PASS' && stage.dbConfigMethods && stage.dbConfigMethods.length > 0) {
                                const inputRow = currentRows.find(cr => Number(cr._row_number) === rNum) || {};
                                for (const colMethod of stage.dbConfigMethods) {
                                    const evalResult = colMethod.evaluateConfig(targetRows, inputRow);
                                    if (evalResult.status === 'FAIL') {
                                        if (colMethod.statusBehavior === 'MUTATE_STATUS') {
                                            valStatus = 'FAIL';
                                            valAction = evalResult.action || 'FLAG';
                                            valDetails = {
                                                ...valDetails,
                                                tableRuleViolation: evalResult.message,
                                                tableRuleDetails: evalResult.details,
                                                dataKeys: evalResult.dataKeys,
                                                statusBehavior: 'MUTATE_STATUS',
                                            };
                                            batchResult.passedCount = Math.max(0, batchResult.passedCount - 1);
                                            batchResult.failedCount += 1;
                                            totalPass = Math.max(0, totalPass - 1);
                                            totalFail += 1;
                                            break;
                                        }
                                        else {
                                            // REPORT_ONLY: record details without changing pass verdict
                                            valDetails = {
                                                ...valDetails,
                                                tableRuleReport: evalResult.message,
                                                tableRuleDetails: evalResult.details,
                                                dataKeys: evalResult.dataKeys,
                                                statusBehavior: 'REPORT_ONLY',
                                                reportOnly: true,
                                            };
                                        }
                                    }
                                }
                            }
                            cumulativeRowOutcomes.set(rNum, {
                                rowNumber: rNum,
                                stageId: stage.stageId,
                                stageName: stage.stageName,
                                validationStatus: valStatus,
                                validationAction: valAction,
                                details: valDetails,
                                targetRecord: targetRows[0] || rMeta.target_record,
                            });
                        }
                        // Synthesize explicit FAIL for any input row that was NOT returned by external query
                        if (db && targetTable) {
                            for (const r of currentRows) {
                                const rNum = Number(r._row_number);
                                if (!stagedRowNumbers.has(rNum)) {
                                    cumulativeRowOutcomes.set(rNum, {
                                        rowNumber: rNum,
                                        stageId: stage.stageId,
                                        stageName: stage.stageName,
                                        validationStatus: 'FAIL',
                                        validationAction: rule0?.onFailAction || 'STOP',
                                        details: {
                                            existence: 'NOT_FOUND_IN_TARGET_DB',
                                            reason: `Record not found in target database ${db.name || db.id} (${targetTable}).`,
                                        },
                                        targetRecord: null,
                                    });
                                    batchResult.totalEvaluated += 1;
                                    batchResult.failedCount += 1;
                                    totalFail += 1;
                                }
                            }
                        }
                    }
                    catch { }
                }
            }
            // Phase 11: Extract downstream keys from the current stage mirror to bridge into next stage
            if (sIdx < this.stages.length - 1 && mirrorTable) {
                try {
                    const downstreamRows = await coordinateInjector.extractDownstreamKeys(mirrorTable, batchCtx.batchId, batchCtx.ruleBlockId, mirrorCols);
                    if (downstreamRows && downstreamRows.length > 0) {
                        const downstreamByRowNum = new Map();
                        for (const dr of downstreamRows) {
                            downstreamByRowNum.set(Number(dr._row_number), dr);
                        }
                        currentRows = currentRows.map(r => {
                            const down = downstreamByRowNum.get(Number(r._row_number));
                            return down ? { ...r, ...down } : r;
                        });
                    }
                }
                catch (downErr) {
                    console.warn(`[ExecutablePipeline] Downstream key extraction notice: ${downErr.message}`);
                }
            }
            // Phase 5: Row-level STOP filtering (do not break entire batch for other continuing rows)
            if (mirrorTable) {
                try {
                    const stoppedRes = await queryPg(`SELECT _row_number FROM ${mirrorTable}
             WHERE _batch_id = $1 AND _rule_block_id = $2
               AND _validation_action IN ('STOP', 'CLOSE')`, [batchCtx.batchId, batchCtx.ruleBlockId]);
                    const stoppedRowNums = new Set((stoppedRes.rows || []).map((r) => Number(r._row_number)));
                    // Also include synthesized STOP/CLOSE rows from cumulative outcomes
                    for (const [rNum, outcome] of cumulativeRowOutcomes.entries()) {
                        if (outcome.validationAction === 'STOP' || outcome.validationAction === 'CLOSE') {
                            stoppedRowNums.add(rNum);
                        }
                    }
                    if (stoppedRowNums.size > 0) {
                        currentRows = currentRows.filter(r => !stoppedRowNums.has(Number(r._row_number)));
                    }
                }
                catch { }
            }
            // Only terminate the pipeline early if ALL rows have stopped
            if (currentRows.length === 0) {
                break;
            }
        }
        const totalEvaluated = stageResults[0]?.totalEvaluated ?? inputRows.length;
        const rowOutcomes = Array.from(cumulativeRowOutcomes.values()).map(o => ({
            rowNumber: o.rowNumber,
            validationStatus: o.validationStatus,
            validationAction: o.validationAction,
            details: o.details,
            targetRecord: o.targetRecord,
        }));
        return {
            taskId: batchCtx.taskId,
            batchId: batchCtx.batchId,
            stageResults,
            totalEvaluated,
            passedCount: totalPass,
            failedCount: totalFail,
            durationMs: Date.now() - t0,
            rowOutcomes,
        };
    }
    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------
    _buildReport(context, finalResult, finalAction, t0) {
        return {
            taskId: context.taskId,
            rowNumber: context.rowNumber,
            transactionId: context.transactionId,
            finalResult,
            finalAction,
            lineageHistory: context.lineageHistory,
            durationMs: Date.now() - t0,
        };
    }
}
