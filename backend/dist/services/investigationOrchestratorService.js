/**
 * Enhanced Investigation & Workflow Orchestrator Service
 * Implements:
 * 1. Universal Ingestion Envelope (Investigation Panel, DB Query Sandbox, Direct API)
 * 2. Singleton Deduplication & In-Flight Lock Management
 * 3. Pre-Flight Database Liveness Probing & Circuit Breakers
 * 4. Dedicated Typed UNLOGGED Mirror Tables per External Table
 * 5. Dynamic Rule-to-SQL Predicate Compilation
 * 6. Pipeline Key Chaining & Multi-Database Branching
 */
import { repo } from '../store/repository.js';
import { eventService } from './events.js';
import { executeExternalChunkQuery } from './externalDataQueryService.js';
import { dbLivenessService } from './dbLivenessService.js';
import { mirrorTableManager } from './mirrorTableManager.js';
import { ruleSqlCompiler } from './ruleSqlCompiler.js';
import { workflowEngineSingleton } from './workflowEngineSingleton.js';
import { queryPg, getPostgresPool, isPostgresConnected } from '../config/postgres.js';
import { nextStageInputResolver } from './nextStageInputResolver.js';
import { validationPipelineBuilder } from './validationPipelineBuilder.js';
import { workflowPipelineBuilder } from './pipeline/index.js';
export const investigationOrchestratorService = {
    /**
     * Universal Workflow Execution Engine.
     * Accepts arbitrary payloads from any caller (Investigation Panel or Query Sandbox),
     * deduplicates in-flight records, probes database liveness, provisions typed mirror tables,
     * compiles rules into dynamic SQL, and executes event-driven key chaining.
     * PHASE 1 & 16: Delegates directly to the compiled DAG pipeline (executeViaNewPipeline).
     */
    async executeUniversalWorkflow(envelope) {
        return this.executeViaNewPipeline(envelope);
    },
    /**
     * @deprecated Legacy monolithic executor (Phase 16: DEAD / DEPRECATED).
     */
    async _legacyExecuteUniversalWorkflow(envelope) {
        const startTime = Date.now();
        const { workflowId, records, sourceType, sourceId, keyField: inputKeyField, keyFields: inputKeyFields, forceRerun, executedBy } = envelope;
        const workflow = await repo.getWorkflowById(workflowId);
        if (!workflow) {
            throw new Error(`Workflow with ID '${workflowId}' not found.`);
        }
        // Hydrate steps with searchParameters from validation_boxes if missing
        try {
            const allBoxes = await repo.getValidationBoxes();
            if (workflow.steps && Array.isArray(workflow.steps)) {
                for (const step of workflow.steps) {
                    if (!Array.isArray(step.searchParameters) || step.searchParameters.length === 0) {
                        const stage = (workflow.stages || []).find(s => s.id === step.stageId);
                        const box = allBoxes.find(b => b.id === step.boxId ||
                            b.id === step.id ||
                            (stage?.ruleBlockIds && Array.isArray(stage.ruleBlockIds) && stage.ruleBlockIds.includes(b.id)) ||
                            (b.name && step.name && b.name.trim().toLowerCase() === step.name.trim().toLowerCase()));
                        if (box && Array.isArray(box.searchParameters) && box.searchParameters.length > 0) {
                            step.searchParameters = JSON.parse(JSON.stringify(box.searchParameters));
                            if (!Array.isArray(step.requiredParams) || step.requiredParams.length === 0) {
                                step.requiredParams = box.searchParameters
                                    .filter((p) => p.required !== false)
                                    .map((p) => p.inputField || p.targetColumn)
                                    .filter(Boolean);
                            }
                            console.log(`[WorkflowEngine] Auto-hydrated ${step.searchParameters?.length || 0} searchParameters for step '${step.name}' from validation box '${box.name}' (${box.id})`);
                        }
                    }
                }
            }
        }
        catch (hydrateErr) {
            console.warn('[WorkflowEngine] Warning while hydrating validation boxes:', hydrateErr.message);
        }
        // Discover ALL parameters configured by the user across this workflow's validation boxes
        // (searchParameters[].inputField, requiredParams, optionalParams).
        // Never fall back to hardcoded field names (e.g. transaction_id, retrieval_ref_num).
        // NOTE: step.sourceField and step.canonicalField are evaluation/reporting fields against
        // returned external data and must NEVER be treated as database search parameters.
        const configuredWorkflowParams = [];
        const seenParamNames = new Set();
        const registerParam = (p) => {
            if (!p)
                return;
            const t = String(p).trim();
            if (t && !seenParamNames.has(t.toLowerCase())) {
                seenParamNames.add(t.toLowerCase());
                configuredWorkflowParams.push(t);
            }
        };
        if (Array.isArray(inputKeyFields)) {
            for (const kf of inputKeyFields)
                registerParam(kf);
        }
        if (workflow.steps && Array.isArray(workflow.steps)) {
            for (const step of workflow.steps) {
                if (Array.isArray(step.searchParameters)) {
                    for (const sp of step.searchParameters)
                        registerParam(sp.inputField);
                }
                if (Array.isArray(step.requiredParams)) {
                    for (const rp of step.requiredParams)
                        registerParam(rp);
                }
                if (Array.isArray(step.optionalParams)) {
                    for (const op of step.optionalParams)
                        registerParam(op);
                }
                if (step.sourceField) {
                    registerParam(step.sourceField);
                }
                if (step.targetField) {
                    registerParam(step.targetField);
                }
            }
        }
        registerParam(inputKeyField);
        // Filter to those parameters actually PRESENT in the input file records
        const sampleRecord = records.length > 0 ? records[0] : {};
        const fileColumns = Object.keys(sampleRecord);
        const activeParamsInFile = [];
        for (const cp of configuredWorkflowParams) {
            const match = fileColumns.find(c => c.toLowerCase() === cp.toLowerCase() ||
                c.toLowerCase().replace(/[^a-z0-9]/g, '') === cp.toLowerCase().replace(/[^a-z0-9]/g, ''));
            if (match && !activeParamsInFile.includes(match)) {
                activeParamsInFile.push(match);
            }
        }
        // Determine primary keyField and full list of active parameters strictly from configured parameters or explicit input key
        const matchedInputKey = inputKeyField && fileColumns.find(c => c.toLowerCase() === inputKeyField.toLowerCase());
        const resolvedKey = activeParamsInFile[0] || matchedInputKey;
        if (!resolvedKey) {
            throw new Error(`[WorkflowEngine] Configuration Error: Unable to determine primary key for workflow "${workflow.name}". ` +
                `None of the configured search parameters ([${configuredWorkflowParams.join(', ')}]) match columns in the ingested file ([${fileColumns.filter(c => !c.startsWith('_')).join(', ')}]). ` +
                `Please configure searchParameters on your validation boxes/workflow steps or supply a valid keyField.`);
        }
        const primaryKeyField = resolvedKey;
        const activeKeyFields = activeParamsInFile.length > 0 ? activeParamsInFile : [primaryKeyField];
        // Helper to extract candidate keys for any record strictly from configured parameters
        const getRecordCandidateKeys = (rec, idx) => {
            const keys = [];
            for (const kf of activeKeyFields) {
                const v = rec[kf];
                if (v !== undefined && v !== null && String(v).trim() !== '') {
                    keys.push(String(v).trim());
                }
            }
            const tuple = activeKeyFields.map(kf => String(rec[kf] ?? '').trim()).filter(Boolean).join(':::');
            if (tuple && !keys.includes(tuple))
                keys.push(tuple);
            if (idx !== undefined)
                keys.push(`ROW-${idx + 1}`);
            return keys.length > 0 ? keys : [`ROW-${(idx ?? 0) + 1}`];
        };
        // 0. Check task_workflow_executions lookup table to prevent redundant execution
        if (sourceId && !forceRerun) {
            try {
                const existingExec = await repo.getTaskWorkflowExecution(sourceId, workflowId);
                if (existingExec && existingExec.status === 'COMPLETED') {
                    console.log(`[WorkflowEngine] Task '${sourceId}' already evaluated with workflow '${workflowId}'. Serving from task_workflow_executions lookup table.`);
                    const resultMap = existingExec.executionSummary?.results || {};
                    const cachedRecords = records.map((r, idx) => {
                        const candidateKeys = getRecordCandidateKeys(r, idx);
                        const k = candidateKeys.find(key => resultMap[key]) || candidateKeys[0];
                        const evalInfo = resultMap[k];
                        return {
                            ...r,
                            _validation_status: evalInfo?.status || (existingExec.failedCount > 0 && existingExec.passedCount === 0 ? 'FAIL' : 'PENDING'),
                            _validation_details: evalInfo?.details || { lookup: 'task_workflow_executions' },
                            _target_record: evalInfo?.targetRecord || null,
                            _target_db: evalInfo?.targetDb || null,
                            _target_table: evalInfo?.targetTable || null,
                            _validation_workflow_id: workflowId,
                            _validation_workflow_name: existingExec.workflowName || workflow?.name,
                            auditTrail: evalInfo?.auditTrail || evalInfo?._stage_results || [],
                            _stage_results: evalInfo?._stage_results || evalInfo?.auditTrail || [],
                            _is_cached: true,
                            _evaluated_at: existingExec.executedAt
                        };
                    });
                    return {
                        jobId: `lookup-${existingExec.id || Date.now()}`,
                        sourceType,
                        workflowId,
                        totalRecords: records.length,
                        processedRecords: records.length,
                        passedCount: existingExec.passedCount,
                        failedCount: existingExec.failedCount,
                        cachedHits: records.length,
                        durationMs: 2,
                        isLookupHit: true,
                        cached: true,
                        records: cachedRecords
                    };
                }
            }
            catch (lookupErr) {
                console.warn('[WorkflowEngine] Lookup table check warning:', lookupErr.message);
            }
        }
        // In-memory verdict caching is bypassed for live reconciliation pipelines
        // to prevent serving obsolete verdicts on asynchronously settled CBS states
        const shouldForceFresh = forceRerun !== false && sourceType !== 'STATIC_DICTIONARY_LOOKUP';
        if (shouldForceFresh) {
            const keys = records.flatMap((r, idx) => getRecordCandidateKeys(r, idx));
            workflowEngineSingleton.evictCache(workflowId, keys);
        }
        const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        console.log(`[WorkflowEngine] Starting job ${jobId} from ${sourceType} with ${records.length} records using parameters [${activeKeyFields.join(', ')}].`);
        // 1. Singleton In-Flight Deduplication & Idempotent Cache Check
        const { cacheHits, inFlight, toExecute } = workflowEngineSingleton.partitionIncomingTransactions(workflowId, records, primaryKeyField);
        console.log(`[WorkflowEngine] Deduplication: ${cacheHits.length} cache hits, ${inFlight.length} in-flight joins, ${toExecute.length} fresh executions.`);
        eventService.broadcastEvent('workflow:started', {
            jobId,
            workflowId,
            workflowName: workflow.name,
            sourceType,
            totalRecords: records.length,
            freshCount: toExecute.length,
            cachedHits: cacheHits.length
        });
        const rawStages = (workflow.stages || []).filter(s => s.enabled);
        const stages = rawStages.length > 0 ? rawStages : [
            {
                id: `stage-default-${workflow.id}`,
                name: 'Validation Stage',
                order: 1,
                targetDbId: workflow.targetDbId || '',
                targetDataSource: workflow.targetTable || '',
                enabled: true,
                actionOnFail: 'STOP'
            }
        ];
        const steps = workflow.steps || [];
        let totalPassed = 0;
        let totalFailed = 0;
        const finalEvaluatedRecords = new Array(records.length);
        // Append cached results directly at their exact original indices
        for (const hit of cacheHits) {
            finalEvaluatedRecords[hit.origIdx] = {
                ...hit.record,
                _validation_status: hit.cached.verdict,
                _is_cached: true,
                _cached_at: new Date(hit.cached.cachedAt).toISOString()
            };
            if (hit.cached.verdict === 'PASS')
                totalPassed++;
            else
                totalFailed++;
        }
        // Wait on any in-flight promises from other users and place at original indices
        if (inFlight.length > 0) {
            const inFlightResults = await Promise.allSettled(inFlight.map((i) => i.promise));
            for (let i = 0; i < inFlight.length; i++) {
                const item = inFlight[i];
                const res = inFlightResults[i];
                if (res.status === 'fulfilled' && res.value) {
                    finalEvaluatedRecords[item.origIdx] = res.value;
                    if (res.value._validation_status === 'PASS')
                        totalPassed++;
                    else
                        totalFailed++;
                }
                else {
                    finalEvaluatedRecords[item.origIdx] = {
                        ...item.record,
                        _validation_status: 'FAIL',
                        _error: 'In-flight execution failed'
                    };
                    totalFailed++;
                }
            }
        }
        // If all records were cached/in-flight, return immediately
        if (toExecute.length === 0) {
            return {
                jobId,
                sourceType,
                workflowId,
                totalRecords: records.length,
                processedRecords: records.length,
                passedCount: totalPassed,
                failedCount: totalFailed,
                cachedHits: cacheHits.length,
                durationMs: Date.now() - startTime,
                records: finalEvaluatedRecords.filter(r => r !== undefined)
            };
        }
        // Register in-flight locks for fresh records
        const jobPromise = (async () => {
            // Execute Stages with Key Chaining and Liveness Checks
            // Strip residual evaluation metadata from previous workflow executions to prevent cross-workflow contamination
            const indexedRecords = toExecute.map((r, idx) => {
                const { _validation_status, _validation_action, _validation_details, _target_record, _target_db, _target_table, _validation_workflow_id, _validation_workflow_name, _stage_results, _audit_trail, auditTrail, stageResults, _isDiagnosticOnly, _diagnosticTaintReason, ...cleanRecord } = r;
                return {
                    ...cleanRecord,
                    _origExecutionIndex: idx,
                    _targetOrigIndex: r._origExecutionIndex ?? idx
                };
            });
            const workflowExecutionId = `wf_exec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
            const upstreamContracts = [];
            // Mandatory Builder Compilation Gate (PIPELINE_ENGINE_MASTER_ARCHITECTURE.md §9)
            let compiledPlan;
            try {
                compiledPlan = validationPipelineBuilder.compile(workflow);
            }
            catch (compileErr) {
                console.error(`[WorkflowEngine] Compilation error in workflow '${workflow.name}':`, compileErr.message);
                eventService.broadcastEvent('workflow:failed', {
                    jobId,
                    workflowId,
                    error: compileErr.message
                });
                for (let i = 0; i < indexedRecords.length; i++) {
                    const r = indexedRecords[i];
                    const targetOrigIdx = r._targetOrigIndex !== undefined ? r._targetOrigIndex : i;
                    finalEvaluatedRecords[targetOrigIdx] = {
                        ...r,
                        _validation_status: 'ERROR',
                        _validation_action: 'STOP',
                        _validation_details: {
                            status: 'PAUSED_CONFIGURATION_ERROR',
                            message: `Workflow compilation failed: ${compileErr.message}`
                        }
                    };
                    totalFailed++;
                }
                return {
                    jobId,
                    sourceType,
                    workflowId,
                    totalRecords: records.length,
                    processedRecords: records.length,
                    passedCount: 0,
                    failedCount: totalFailed,
                    cachedHits: cacheHits.length,
                    durationMs: Date.now() - startTime,
                    records: finalEvaluatedRecords.filter(r => r !== undefined)
                };
            }
            let currentActiveKeys = indexedRecords.map((r, idx) => getRecordCandidateKeys(r, idx)[0]);
            let currentActiveRecords = [...indexedRecords];
            let previousMirrorTable = null;
            const latestEvaluatedByOrigIndex = new Map();
            // Execute STRICTLY AND EXCLUSIVELY against compiledPlan.stages (Director/Builder Pattern)
            for (let stageIdx = 0; stageIdx < compiledPlan.stages.length; stageIdx++) {
                const stagePlan = compiledPlan.stages[stageIdx];
                const stage = {
                    id: stagePlan.stageId,
                    name: stagePlan.stageName,
                    order: stagePlan.order,
                    enabled: true,
                    targetDbId: stagePlan.targetDbId || '',
                    targetDataSource: stagePlan.targetTable || '',
                    cardinalityPolicy: stagePlan.cardinalityPolicy,
                    aggregationStrategy: stagePlan.aggregationStrategy,
                    orderByColumn: stagePlan.orderByColumn,
                    attachedDbConfigIds: stagePlan.attachedDbConfigIds
                };
                const stageExecutionId = `stg_exec_${stage.id}_${stageIdx}`;
                const stageSteps = stagePlan.steps;
                // Hydrate database table column configurations strictly from attachedDbConfigIds (Anti-Contamination Mandate §10)
                const boundConfigIds = Array.from(new Set([
                    ...(stagePlan.attachedDbConfigIds || []),
                    ...stageSteps.flatMap(s => s.attachedDbConfigIds || s.columnConfigurationIds || [])
                ]));
                if (boundConfigIds.length > 0) {
                    const loadedConfigs = (await Promise.all(boundConfigIds.map(id => repo.getColumnConfigurationById(id))))
                        .filter((c) => c !== null);
                    for (const step of stageSteps) {
                        step.columnConfigurations = loadedConfigs;
                    }
                }
                const targetDb = await repo.getDatabaseConnectionById(stage.targetDbId || workflow.targetDbId || '');
                if (!targetDb) {
                    console.warn(`[WorkflowEngine] Target database not configured for stage '${stage.name}'. Using simulation.`);
                }
                // 2. Pre-Flight Database Liveness Probe & Circuit Breaker
                if (targetDb) {
                    const liveness = await dbLivenessService.probeLiveness(targetDb, 3500);
                    if (!liveness.isAlive) {
                        console.warn(`[WorkflowEngine] Circuit tripped for DB '${targetDb.name}': ${liveness.error}`);
                        eventService.broadcastEvent('workflow:db_unreachable', {
                            jobId,
                            stageId: stage.id,
                            dbId: targetDb.id,
                            dbName: targetDb.name,
                            error: liveness.error
                        });
                        // Gracefully pause affected transactions without crashing
                        for (let rIdx = 0; rIdx < currentActiveRecords.length; rIdx++) {
                            const r = currentActiveRecords[rIdx];
                            const origIdx = r._origExecutionIndex ?? rIdx;
                            const txKey = getRecordCandidateKeys(r, rIdx)[0] || '';
                            latestEvaluatedByOrigIndex.set(origIdx, {
                                ...r,
                                _validation_status: 'PAUSED_DB_OFFLINE',
                                _validation_details: { circuitBreaker: 'OPEN', error: liveness.error },
                                _evaluated_at: new Date().toISOString()
                            });
                            if (txKey) {
                                workflowEngineSingleton.cacheResult(workflowId, txKey, 'PAUSED_DB_OFFLINE', 'PAUSED_DB_OFFLINE', { circuitBreaker: 'OPEN', error: liveness.error });
                            }
                        }
                        break;
                    }
                }
                // 3. Dynamic Lineage & Key Chaining via NextStageInputResolver
                let effectiveQueryKeys = currentActiveKeys;
                let currentStageInputResolution = null;
                if (stageIdx > 0) {
                    try {
                        // Priority 1: Key mappings from QueryExtraction
                        const stageExtractions = (await repo.getQueryExtractionsByWorkflowId(workflow.id))
                            .filter((qe) => qe.stageId === stage.id && qe.enabled !== false);
                        const extractionKeys = stageExtractions
                            .flatMap((qe) => (qe.keyMappings || []).map(km => km.sourceField))
                            .filter(Boolean);
                        // Priority 2: Step search parameters and required params
                        const stageStepKeys = stageSteps
                            .flatMap((step) => (step.searchParameters || []).map((sp) => sp.targetColumn || sp.inputField))
                            .filter(Boolean);
                        const stageRequiredParams = stageSteps.flatMap((step) => step.requiredParams || []).filter(Boolean);
                        const targetRequiredKeys = Array.from(new Set([...extractionKeys, ...stageStepKeys, ...stageRequiredParams]));
                        currentStageInputResolution = nextStageInputResolver.resolveStageInput({
                            targetStageId: stage.id,
                            targetStageName: stage.name,
                            workflowExecutionId,
                            requiredKeys: targetRequiredKeys,
                            cardinalityPolicy: stage.cardinalityPolicy || stageSteps[0]?.cardinalityPolicy || 'STRICT_SINGLE',
                            upstreamContracts,
                            initialTaskDatasetTable: 'task_dataset_transactions',
                            initialKeys: activeKeyFields
                        });
                        if (currentStageInputResolution.status === 'CONFIGURATION_ERROR') {
                            console.warn(`[WorkflowEngine] NextStageInputResolver Configuration Notice for stage '${stage.name}': ${currentStageInputResolution.errorMessage}`);
                        }
                        else if (currentStageInputResolution.resolvedSource.sourceType === 'MIRROR_TABLE' ||
                            currentStageInputResolution.resolvedSource.sourceType === 'UPSTREAM_PREDECESSOR') {
                            const sourceTable = currentStageInputResolution.resolvedSource.tableName;
                            const sourceCols = await mirrorTableManager.getMirrorColumns(sourceTable);
                            const candidateKey = targetRequiredKeys.find(k => sourceCols.includes(k)) || targetRequiredKeys[0];
                            if (candidateKey && sourceCols.includes(candidateKey)) {
                                // Architectural Mandate: Do NOT restrict with _validation_status = 'PASS'.
                                // Hydrated rows from FAIL + CONTINUE are valid operational evidence!
                                const chainQuery = `
                  SELECT DISTINCT "${candidateKey}" as key_val 
                  FROM ${sourceTable} 
                  WHERE _batch_id = $1 AND "${candidateKey}" IS NOT NULL
                `;
                                const chainRes = await queryPg(chainQuery, [jobId]);
                                if (chainRes.rows.length > 0) {
                                    effectiveQueryKeys = chainRes.rows.map((r) => String(r.key_val));
                                    console.log(`[WorkflowEngine] Key Chaining: Resolved ${effectiveQueryKeys.length} primary keys for stage '${stage.name}' from ${sourceTable} (Quality: ${currentStageInputResolution.inputQuality}).`);
                                }
                            }
                        }
                    }
                    catch (chainErr) {
                        console.warn(`[WorkflowEngine] Key chaining inspection fallback: ${chainErr.message}`);
                    }
                }
                // 4. Provision Dedicated Typed Mirror Table in PostgreSQL
                const targetTable = stage.targetDataSource || workflow.targetTable;
                if (!targetTable) {
                    throw new Error(`[WorkflowEngine] Configuration Error: Stage "${stage.name}" has no target data source or table configured.`);
                }
                let mirrorTable;
                try {
                    mirrorTable = await mirrorTableManager.ensureMirrorTableExists(targetDb, targetTable);
                }
                catch (mirrorErr) {
                    console.warn(`[WorkflowEngine] Fallback to standard staging mirror for ${targetTable}: ${mirrorErr.message}`);
                    mirrorTable = await mirrorTableManager.ensureMirrorTableExists(null, `staging_${targetTable}`);
                }
                // 5. Fetch External Data & Ingest to Mirror
                // Build the extraction using searchParameters configured for THIS stage
                const stageSearchParams = [];
                const seenInputs = new Set();
                for (const step of stageSteps) {
                    if (Array.isArray(step.searchParameters) && step.searchParameters.length > 0) {
                        for (const sp of step.searchParameters) {
                            if (sp.inputField && !seenInputs.has(sp.inputField.toLowerCase())) {
                                seenInputs.add(sp.inputField.toLowerCase());
                                stageSearchParams.push({
                                    inputField: sp.inputField,
                                    targetColumn: sp.targetColumn || sp.inputField,
                                    required: sp.required !== false
                                });
                            }
                        }
                    }
                    else if (Array.isArray(step.requiredParams) && step.requiredParams.length > 0) {
                        for (const p of step.requiredParams) {
                            if (p && !seenInputs.has(p.toLowerCase())) {
                                seenInputs.add(p.toLowerCase());
                                stageSearchParams.push({ inputField: p, targetColumn: p, required: true });
                            }
                        }
                    }
                }
                // Only fallback to activeKeyFields if this stage has no explicit search parameters configured
                if (stageSearchParams.length === 0) {
                    for (const kf of activeKeyFields) {
                        if (!seenInputs.has(kf.toLowerCase())) {
                            seenInputs.add(kf.toLowerCase());
                            stageSearchParams.push({ inputField: kf, targetColumn: kf, required: true });
                        }
                    }
                }
                const extraction = {
                    id: `ext-${jobId}-${stage.id}`,
                    workflowId: workflow.id,
                    stageId: stage.id,
                    targetDbId: stage.targetDbId || workflow.targetDbId || '',
                    targetDataSource: targetTable,
                    selectedColumns: [],
                    keyMappings: stageSearchParams.map(sp => ({ inputField: sp.inputField, sourceField: sp.targetColumn, required: sp.required })),
                    enabled: true
                };
                const externalResult = await executeExternalChunkQuery(extraction, { chunkId: `chunk-${jobId}-01`, sequence: 1, transactionIds: effectiveQueryKeys }, currentActiveRecords);
                if (externalResult.success) {
                    const recordsToMirror = [];
                    const seenMirrorKeys = new Set();
                    for (let rIdx = 0; rIdx < currentActiveRecords.length; rIdx++) {
                        const inputRec = currentActiveRecords[rIdx];
                        const candidateKeys = getRecordCandidateKeys(inputRec, rIdx);
                        let matchedTarget = null;
                        for (const ck of candidateKeys) {
                            if (externalResult.correlatedRecords[ck]) {
                                matchedTarget = externalResult.correlatedRecords[ck];
                                break;
                            }
                        }
                        if (matchedTarget) {
                            const primaryVal = candidateKeys[0] || `ROW-${rIdx + 1}`;
                            const targetSig = JSON.stringify(matchedTarget);
                            if (!seenMirrorKeys.has(targetSig)) {
                                seenMirrorKeys.add(targetSig);
                                recordsToMirror.push({
                                    [primaryKeyField]: primaryVal,
                                    _input_key: primaryVal,
                                    _task_id: inputRec.task_id || sourceId || 'UNKNOWN_TASK',
                                    _row_number: inputRec._rowNumber ?? inputRec.row_number ?? (rIdx + 1),
                                    ...matchedTarget
                                });
                            }
                        }
                    }
                    if (recordsToMirror.length > 0) {
                        await mirrorTableManager.bulkInsertToMirror(mirrorTable, jobId, stage.id, recordsToMirror);
                    }
                }
                // 6. Dynamic Rule-to-SQL Compilation & Evaluation
                const mirrorCols = await mirrorTableManager.getMirrorColumns(mirrorTable);
                const compiledSql = ruleSqlCompiler.compileBlockUpdateSql(mirrorTable, primaryKeyField, stageSteps, mirrorCols);
                // Execute compiled set-based batch update
                await queryPg(compiledSql.fullUpdateSql, [jobId]);
                const stageInputRecords = [...currentActiveRecords];
                // 7. Segregate Passed vs. Failed Partitions
                // Resolve stage-specific primary key column present in this mirror table
                const stageTargetCols = stageSearchParams.map(sp => (sp.targetColumn || sp.inputField).toLowerCase().replace(/[^a-z0-9_]/g, '_'));
                const stageInputCols = stageSearchParams.map(sp => sp.inputField.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
                const resolvedMirrorKeyCol = (mirrorCols.includes(primaryKeyField.toLowerCase()) ? primaryKeyField.toLowerCase() : null) ||
                    stageTargetCols.find(c => mirrorCols.includes(c)) ||
                    stageInputCols.find(c => mirrorCols.includes(c)) ||
                    (mirrorCols.includes('fe_utrnno') ? 'fe_utrnno' : null) ||
                    (mirrorCols.includes('transaction_id') ? 'transaction_id' : null);
                const hasPayloadCol = mirrorCols.includes('payload');
                const keyExpr = resolvedMirrorKeyCol
                    ? `"${resolvedMirrorKeyCol}"::text`
                    : (hasPayloadCol ? `COALESCE(payload->>'_input_key', payload->>'${primaryKeyField}', _mirror_id::text)` : `_mirror_id::text`);
                const partitionQuery = `
          SELECT ${keyExpr} as tx_key, _validation_status, _validation_action, _validation_details 
          FROM ${mirrorTable} 
          WHERE _batch_id = $1
        `;
                const partitionRes = await queryPg(partitionQuery, [jobId]);
                const partitionMap = new Map();
                partitionRes.rows.forEach((r) => partitionMap.set(String(r.tx_key), r));
                // Detect downstream connection edge from this stage to next stage
                const nextStage = stageIdx + 1 < stages.length ? stages[stageIdx + 1] : null;
                let stageConnectingEdge = null;
                if (nextStage && workflow.connections && workflow.connections.length > 0) {
                    const currentStageNodeId = stage.id.replace(/^stage-/, '');
                    const nextStageNodeId = nextStage.id.replace(/^stage-/, '');
                    stageConnectingEdge = workflow.connections.find((c) => (c.fromNodeId === stage.id || c.fromNodeId === currentStageNodeId) &&
                        (c.toNodeId === nextStage.id || c.toNodeId === nextStageNodeId));
                }
                const forwardKeys = [];
                const passKeys = [];
                const failKeys = [];
                const processedKeysInStage = new Set();
                for (let recIdx = 0; recIdx < stageInputRecords.length; recIdx++) {
                    const orig = stageInputRecords[recIdx];
                    const candidateKeys = getRecordCandidateKeys(orig, recIdx);
                    const origIdx = orig._origExecutionIndex ?? recIdx;
                    let matchedPartitionRow = null;
                    for (const ck of candidateKeys) {
                        if (partitionMap.has(ck)) {
                            matchedPartitionRow = partitionMap.get(ck);
                            break;
                        }
                    }
                    if (matchedPartitionRow) {
                        // Found in target database and evaluated in mirror
                        const keyStr = String(matchedPartitionRow.tx_key);
                        processedKeysInStage.add(keyStr);
                        const isPass = matchedPartitionRow._validation_status === 'PASS';
                        const action = matchedPartitionRow._validation_action || (isPass ? 'CONTINUE' : 'STOP');
                        if (isPass) {
                            passKeys.push(keyStr);
                        }
                        else {
                            failKeys.push(keyStr);
                        }
                        let targetRec = null;
                        if (externalResult?.correlatedRecords) {
                            for (const k of candidateKeys) {
                                if (externalResult.correlatedRecords[k]) {
                                    targetRec = externalResult.correlatedRecords[k];
                                    break;
                                }
                            }
                        }
                        const stageStepEntries = stageSteps.map((st) => ({
                            ruleId: st.id,
                            ruleName: st.name || stage.name,
                            stageId: stage.id,
                            stageName: stage.name,
                            targetDb: targetDb?.name || stage.targetDbId || 'Target DB',
                            targetTable,
                            validationResult: isPass ? 'PASS' : 'FAIL',
                            pipelineAction: action,
                            message: isPass
                                ? `Condition satisfied in ${targetDb?.name || stage.targetDbId || 'Target DB'} (${targetTable})`
                                : (matchedPartitionRow._validation_details?.message || `Discrepancy detected in ${targetTable}`)
                        }));
                        const prevRecord = latestEvaluatedByOrigIndex.get(origIdx);
                        const prevAuditTrail = Array.isArray(prevRecord?.auditTrail) ? prevRecord.auditTrail : [];
                        const updatedAuditTrail = [...prevAuditTrail, ...stageStepEntries];
                        latestEvaluatedByOrigIndex.set(origIdx, {
                            ...orig,
                            _validation_status: matchedPartitionRow._validation_status,
                            _validation_action: matchedPartitionRow._validation_action,
                            _validation_details: {
                                ...(typeof matchedPartitionRow._validation_details === 'object' ? matchedPartitionRow._validation_details : {}),
                                stageResults: updatedAuditTrail
                            },
                            auditTrail: updatedAuditTrail,
                            _audit_trail: updatedAuditTrail,
                            _stage_results: updatedAuditTrail,
                            _isDiagnosticOnly: orig?._isDiagnosticOnly || false,
                            _target_record: targetRec || null,
                            _target_db: targetDb?.name || stage.targetDbId || 'Target DB',
                            _target_table: targetTable,
                            _validation_workflow_id: workflow.id,
                            _validation_workflow_name: workflow.name,
                            _evaluated_at: new Date().toISOString()
                        });
                        // Determine if record advances downstream
                        let canAdvance = false;
                        if (nextStage) {
                            if (stageConnectingEdge) {
                                if (stageConnectingEdge.fromPort === 'fail') {
                                    canAdvance = !isPass;
                                }
                                else if (stageConnectingEdge.fromPort === 'pass') {
                                    canAdvance = isPass;
                                }
                                else {
                                    canAdvance = isPass || (action === 'CONTINUE' || action === 'REPORT');
                                }
                            }
                            else {
                                canAdvance = isPass || (action === 'CONTINUE' || action === 'REPORT');
                            }
                        }
                        if (canAdvance) {
                            forwardKeys.push(keyStr);
                        }
                        if (!shouldForceFresh) {
                            workflowEngineSingleton.cacheResult(workflowId, keyStr, isPass ? 'PASS' : 'FAIL', matchedPartitionRow._validation_status, matchedPartitionRow._validation_details);
                        }
                    }
                    else {
                        // CRITICAL: Record was NOT found in target database / mirror!
                        const recKey = candidateKeys[0] || `ROW-${recIdx + 1}`;
                        failKeys.push(recKey);
                        const failDetails = {
                            existence: 'NOT_FOUND_IN_TARGET_DB',
                            message: `Record not found in target database ${targetDb?.name || stage.targetDbId || 'Target DB'} (${targetTable})`
                        };
                        const stageFailAction = stageSteps[0]?.onFailAction || stage.actionOnFail || 'STOP';
                        const stageStepEntries = stageSteps.map((st) => ({
                            ruleId: st.id,
                            ruleName: st.name || stage.name,
                            stageId: stage.id,
                            stageName: stage.name,
                            targetDb: targetDb?.name || stage.targetDbId || 'Target DB',
                            targetTable,
                            validationResult: 'FAIL',
                            pipelineAction: stageFailAction,
                            message: `Record not found in target database ${targetDb?.name || stage.targetDbId || 'Target DB'} (${targetTable})`
                        }));
                        const prevRecord = latestEvaluatedByOrigIndex.get(origIdx);
                        const prevAuditTrail = Array.isArray(prevRecord?.auditTrail) ? prevRecord.auditTrail : [];
                        const updatedAuditTrail = [...prevAuditTrail, ...stageStepEntries];
                        latestEvaluatedByOrigIndex.set(origIdx, {
                            ...orig,
                            _validation_status: 'FAIL',
                            _validation_action: stageFailAction,
                            _validation_details: {
                                ...failDetails,
                                stageResults: updatedAuditTrail
                            },
                            auditTrail: updatedAuditTrail,
                            _audit_trail: updatedAuditTrail,
                            _stage_results: updatedAuditTrail,
                            _isDiagnosticOnly: orig?._isDiagnosticOnly || false,
                            _target_record: null,
                            _target_db: targetDb?.name || stage.targetDbId || 'Target DB',
                            _target_table: targetTable,
                            _validation_workflow_id: workflow.id,
                            _validation_workflow_name: workflow.name,
                            _evaluated_at: new Date().toISOString()
                        });
                        // Determine if NOT_FOUND record advances downstream
                        let canAdvance = false;
                        if (nextStage) {
                            if (stageConnectingEdge) {
                                if (stageConnectingEdge.fromPort === 'fail') {
                                    canAdvance = true; // Negative test / fallback branch!
                                }
                                else if (stageConnectingEdge.fromPort === 'pass') {
                                    canAdvance = false;
                                }
                                else {
                                    canAdvance = stageFailAction === 'CONTINUE' || stageFailAction === 'REPORT';
                                }
                            }
                            else {
                                canAdvance = stageFailAction === 'CONTINUE' || stageFailAction === 'REPORT';
                            }
                        }
                        if (canAdvance) {
                            forwardKeys.push(recKey);
                        }
                        if (!shouldForceFresh) {
                            workflowEngineSingleton.cacheResult(workflowId, recKey, 'FAIL', 'FAIL', failDetails);
                        }
                    }
                }
                console.log(`[WorkflowEngine] Stage '${stage.name}' completed: ${passKeys.length} passed, ${failKeys.length} failed, ${forwardKeys.length} forwarded downstream.`);
                // Register StageOutputContract for downstream consumption (Partitioned Summary + Results)
                const stageSummary = {
                    stageId: stage.id,
                    stageName: stage.name,
                    order: stageIdx + 1,
                    batchId: jobId,
                    ruleBlockId: stage.id,
                    stageExecutionId,
                    workflowExecutionId,
                    validationResult: failKeys.length === 0 ? 'PASS' : 'FAIL',
                    pipelineAction: stageSteps[0]?.onPassAction || 'CONTINUE',
                    outputTarget: {
                        type: 'MIRROR_TABLE',
                        tableName: mirrorTable
                    },
                    producedKeys: Object.keys((sampleRecord || {})).concat(stageSteps.map(s => s.targetField || '').filter(Boolean)),
                    totalRows: stageInputRecords.length,
                    passedRows: passKeys.length,
                    failedRows: failKeys.length,
                    errorRows: 0,
                    executedAt: new Date().toISOString()
                };
                const stageOutputContract = {
                    ...stageSummary,
                    summary: stageSummary,
                    outputTarget: {
                        type: 'MIRROR_TABLE',
                        tableName: mirrorTable
                    }
                };
                upstreamContracts.push(stageOutputContract);
                eventService.broadcastEvent('workflow:stage_completed', {
                    jobId,
                    stageId: stage.id,
                    stageName: stage.name,
                    passedCount: passKeys.length,
                    failedCount: failKeys.length,
                    forwardedCount: forwardKeys.length,
                    mirrorTable,
                    stageExecutionId,
                    workflowExecutionId
                });
                // 8. Event-Driven Chaining: Route forward subset to next stage
                currentActiveKeys = forwardKeys;
                currentActiveRecords = stageInputRecords.filter((r, idx) => {
                    const rKeys = getRecordCandidateKeys(r, idx);
                    return rKeys.some(k => forwardKeys.includes(k));
                });
                // Granular Data Quality Tracking (PIPELINE_ENGINE_MASTER_ARCHITECTURE.md §6)
                currentActiveRecords.forEach((r, idx) => {
                    const rKeys = getRecordCandidateKeys(r, idx);
                    const matchedRow = partitionRes.rows.find((pr) => rKeys.includes(String(pr.tx_key)));
                    if (matchedRow && matchedRow._validation_status === 'FAIL') {
                        r._inputQuality = 'UPSTREAM_FAILED_BUT_HYDRATED';
                        r._upstreamDiscrepancyReason = matchedRow._validation_details?.message || 'Upstream stage validation failed';
                    }
                });
                // Heartbeat pulse: record progress in task_batch_heartbeats
                try {
                    await queryPg(`
            INSERT INTO task_batch_heartbeats (task_id, batch_id, worker_pid, last_chunk_index, total_chunks, last_heartbeat_at)
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (task_id, batch_id)
            DO UPDATE SET
              last_chunk_index = EXCLUDED.last_chunk_index,
              last_heartbeat_at = NOW();
          `, [sourceId || workflowId, jobId, process.pid, stageIdx + 1, stages.length]);
                }
                catch (hbErr) {
                    // Non-blocking telemetry
                }
                previousMirrorTable = mirrorTable;
                // If no records passed/forwarded, terminate pipeline early
                if (currentActiveRecords.length === 0) {
                    console.log(`[WorkflowEngine] No records forwarded from stage '${stage.name}'. Terminating pipeline early.`);
                    break;
                }
            }
            // Consolidate final evaluated records preserving original index order
            for (let i = 0; i < toExecute.length; i++) {
                const targetOrigIdx = toExecute[i]._origExecutionIndex ?? i;
                const latest = latestEvaluatedByOrigIndex.get(i) || {
                    ...toExecute[i],
                    _validation_status: 'FAIL',
                    _validation_details: { message: 'Pipeline terminated without evaluating record' }
                };
                const { _origExecutionIndex, _targetOrigIndex, ...cleanRecord } = latest;
                finalEvaluatedRecords[targetOrigIdx] = cleanRecord;
                if (cleanRecord._validation_status === 'PASS')
                    totalPassed++;
                else
                    totalFailed++;
            }
            return {
                jobId,
                sourceType,
                workflowId,
                totalRecords: records.length,
                processedRecords: records.length,
                passedCount: totalPassed,
                failedCount: totalFailed,
                cachedHits: cacheHits.length,
                durationMs: Date.now() - startTime,
                records: finalEvaluatedRecords.filter(r => r !== undefined)
            };
        })();
        // Register locks for all executing transactions
        for (let idx = 0; idx < toExecute.length; idx++) {
            const rec = toExecute[idx];
            const k = getRecordCandidateKeys(rec, idx)[0];
            if (k) {
                workflowEngineSingleton.registerInFlightLock(workflowId, k, jobPromise);
            }
        }
        const result = await jobPromise;
        eventService.broadcastEvent('workflow:completed', {
            jobId,
            workflowId,
            totalRecords: result.totalRecords,
            passedCount: result.passedCount,
            failedCount: result.failedCount,
            durationMs: result.durationMs
        });
        // Post-completion: Clean up transient mirror batch rows to prevent unbounded growth
        for (const stage of stages) {
            try {
                const targetDb = await repo.getDatabaseConnectionById(stage.targetDbId || workflow.targetDbId || '');
                const mirrorName = mirrorTableManager.getMirrorTableName(targetDb ? (targetDb.name || targetDb.id) : 'local', stage.targetDataSource || 'transactions');
                await mirrorTableManager.cleanupMirrorBatch(mirrorName, jobId);
            }
            catch (cleanupErr) {
                console.warn(`[WorkflowEngine] Mirror cleanup warning for stage '${stage.name}': ${cleanupErr.message}`);
            }
        }
        // Record execution in task_workflow_executions lookup table and sync task_dataset_transactions in PostgreSQL
        if (sourceId) {
            try {
                const sanitizeTargetRecord = (tr) => {
                    if (!tr || typeof tr !== 'object')
                        return tr;
                    const { _rawRows, ...rest } = tr;
                    if (rest._groupedData && typeof rest._groupedData === 'object') {
                        const { _rawRows: _, ...cleanGd } = rest._groupedData;
                        rest._groupedData = cleanGd;
                    }
                    if (rest._groupComposite && typeof rest._groupComposite === 'object') {
                        const { _rawRows: _, ...cleanGc } = rest._groupComposite;
                        rest._groupComposite = cleanGc;
                    }
                    return rest;
                };
                const resultMap = {};
                for (let idx = 0; idx < result.records.length; idx++) {
                    const rec = result.records[idx];
                    const candidateKeys = getRecordCandidateKeys(rec, idx);
                    const sanitizedTarget = sanitizeTargetRecord(rec._target_record);
                    const evalEntry = {
                        status: rec._validation_status,
                        details: rec._validation_details,
                        targetRecord: sanitizedTarget || null,
                        targetDb: rec._target_db || null,
                        targetTable: rec._target_table || null,
                        auditTrail: rec.auditTrail || rec._stage_results || []
                    };
                    for (const ck of candidateKeys) {
                        resultMap[ck] = evalEntry;
                    }
                }
                await repo.recordTaskWorkflowExecution({
                    taskId: sourceId,
                    workflowId,
                    workflowName: workflow.name,
                    status: 'COMPLETED',
                    totalRecords: records.length,
                    passedCount: result.passedCount,
                    failedCount: result.failedCount,
                    durationMs: result.durationMs,
                    executionSummary: { results: resultMap },
                    executedBy: executedBy || 'investigator'
                });
                await repo.updateTaskDatasetValidationStatus(sourceId, workflowId, workflow.name, result.records.map((r, idx) => ({
                    key: r._rowNumber ? `ROW-${r._rowNumber}` : (r.row_number ? `ROW-${r.row_number}` : (getRecordCandidateKeys(r, idx)[0] || `ROW-${idx + 1}`)),
                    status: r._validation_status,
                    details: r._validation_details,
                    targetRecord: sanitizeTargetRecord(r._target_record) || null,
                    targetDb: r._target_db || null,
                    targetTable: r._target_table || null,
                    auditTrail: r.auditTrail || r._stage_results || [],
                    stageResults: r._stage_results || r.auditTrail || []
                })));
                console.log(`[WorkflowEngine] Recorded execution and synced task_dataset_transactions for task '${sourceId}', workflow '${workflowId}'.`);
            }
            catch (recErr) {
                console.warn('[WorkflowEngine] Notice recording task workflow execution:', recErr.message);
            }
        }
        return result;
    },
    /**
     * Resumes previously paused transactions (e.g. after target database recovers from offline status).
     * Evicts PAUSED_DB_OFFLINE cache entries and re-runs the universal workflow.
     */
    async resumePausedTransactions(workflowId, records, keyField, keyFields) {
        return await this.executeUniversalWorkflow({
            sourceType: 'DIRECT_API',
            workflowId,
            records,
            keyField,
            keyFields,
            forceRerun: true
        });
    },
    /**
     * WAVE 4: executeViaNewPipeline
     * Structured DAG-based batch execution path using WorkflowPipelineBuilder (§3.2, §7.2).
     */
    async executeViaNewPipeline(envelope) {
        const startTime = Date.now();
        const { workflowId, records, sourceType, sourceId, forceRerun } = envelope;
        const workflow = await repo.getWorkflowById(workflowId);
        if (!workflow) {
            throw new Error(`Workflow with ID '${workflowId}' not found.`);
        }
        const jobId = `job-newpipe-${Date.now()}`;
        const taskId = sourceId || `task-${Date.now()}`;
        // Validate that input records supply the required search keys/parameters for workflow execution (Phase 14 & Finding 2/3)
        const configuredWorkflowParams = [];
        const registerParam = (p) => {
            if (p && typeof p === 'string' && p.trim()) {
                const clean = p.trim();
                if (!configuredWorkflowParams.includes(clean))
                    configuredWorkflowParams.push(clean);
            }
        };
        if (workflow.stages && Array.isArray(workflow.stages)) {
            for (const stg of workflow.stages) {
                if (Array.isArray(stg.steps)) {
                    for (const step of stg.steps) {
                        if (Array.isArray(step.searchParameters)) {
                            for (const sp of step.searchParameters)
                                registerParam(sp.inputField);
                        }
                        if (Array.isArray(step.requiredParams)) {
                            for (const rp of step.requiredParams)
                                registerParam(rp);
                        }
                        if (step.sourceField)
                            registerParam(step.sourceField);
                        if (step.targetField)
                            registerParam(step.targetField);
                    }
                }
            }
        }
        if (workflow.steps && Array.isArray(workflow.steps)) {
            for (const step of workflow.steps) {
                if (Array.isArray(step.searchParameters)) {
                    for (const sp of step.searchParameters)
                        registerParam(sp.inputField);
                }
                if (Array.isArray(step.requiredParams)) {
                    for (const rp of step.requiredParams)
                        registerParam(rp);
                }
                if (step.sourceField)
                    registerParam(step.sourceField);
                if (step.targetField)
                    registerParam(step.targetField);
            }
        }
        registerParam(envelope.keyField);
        if (Array.isArray(envelope.keyFields)) {
            for (const kf of envelope.keyFields)
                registerParam(kf);
        }
        const sampleRecord = (records && records.length > 0) ? records[0] : {};
        const fileColumns = Object.keys(sampleRecord);
        const activeParamsInFile = [];
        for (const cp of configuredWorkflowParams) {
            const match = fileColumns.find(c => c.toLowerCase() === cp.toLowerCase() ||
                c.toLowerCase().replace(/[^a-z0-9]/g, '') === cp.toLowerCase().replace(/[^a-z0-9]/g, ''));
            if (match && !activeParamsInFile.includes(match)) {
                activeParamsInFile.push(match);
            }
        }
        const matchedInputKey = envelope.keyField && fileColumns.find(c => c.toLowerCase() === envelope.keyField.toLowerCase());
        const resolvedKey = activeParamsInFile[0] || matchedInputKey;
        if (configuredWorkflowParams.length > 0 && !resolvedKey) {
            throw new Error(`[WorkflowEngine] Configuration Error: Unable to determine primary key for workflow "${workflow.name}". ` +
                `None of the configured search parameters ([${configuredWorkflowParams.join(', ')}]) match columns in the ingested file ([${fileColumns.filter(c => !c.startsWith('_')).join(', ')}]). ` +
                `Please configure searchParameters on your validation boxes/workflow steps or supply a valid keyField.`);
        }
        // 0. Check task_workflow_executions lookup table to prevent redundant execution
        if (sourceId && !forceRerun) {
            try {
                const existingExec = await repo.getTaskWorkflowExecution(sourceId, workflowId);
                if (existingExec && existingExec.status === 'COMPLETED') {
                    console.log(`[executeViaNewPipeline] Task '${sourceId}' already evaluated with workflow '${workflowId}'. Serving from task_workflow_executions lookup table.`);
                    const resultMap = existingExec.executionSummary?.results || {};
                    const cachedRecords = (records || []).map((r, idx) => {
                        const rowNum = r._row_number ?? r.row_number ?? (idx + 1);
                        const k = String(r.transaction_id ?? r.id ?? rowNum);
                        const evalInfo = resultMap[k] || resultMap[`ROW-${rowNum}`];
                        return {
                            ...r,
                            _row_number: rowNum,
                            _validation_status: evalInfo?.status || (existingExec.failedCount > 0 && existingExec.passedCount === 0 ? 'FAIL' : 'PENDING'),
                            _validation_action: evalInfo?.action || 'CONTINUE',
                            _validation_details: evalInfo?.details || { lookup: 'task_workflow_executions' },
                            _target_record: evalInfo?.targetRecord || null,
                            _validation_workflow_id: workflowId,
                            _validation_workflow_name: existingExec.workflowName || workflow?.name,
                            auditTrail: evalInfo?.auditTrail || [],
                            _is_cached: true,
                            _evaluated_at: existingExec.executedAt
                        };
                    });
                    return {
                        jobId: `lookup-${existingExec.id || Date.now()}`,
                        sourceType: sourceType || 'DIRECT_API',
                        workflowId,
                        totalRecords: records.length,
                        processedRecords: records.length,
                        passedCount: existingExec.passedCount,
                        failedCount: existingExec.failedCount,
                        cachedHits: records.length,
                        durationMs: 2,
                        isLookupHit: true,
                        cached: true,
                        records: cachedRecords
                    };
                }
            }
            catch (lookupErr) {
                console.warn('[executeViaNewPipeline] Lookup table check warning:', lookupErr.message);
            }
        }
        eventService.broadcastEvent('workflow:started', {
            jobId,
            workflowId,
            workflowName: workflow.name,
            sourceType: sourceType || 'DIRECT_API',
            totalRecords: (records || []).length,
            freshCount: (records || []).length,
            cachedHits: 0
        });
        let lockClient = null;
        if (isPostgresConnected && sourceId) {
            try {
                const pool = getPostgresPool();
                lockClient = await pool.connect();
                await lockClient.query(`SELECT pg_advisory_lock(('x' || substr(md5('task_exec_' || $1), 1, 16))::bit(64)::bigint)`, [sourceId]);
            }
            catch (lockErr) {
                console.warn(`[executeViaNewPipeline] Advisory lock notice: ${lockErr.message}`);
                if (lockClient) {
                    try {
                        lockClient.release();
                    }
                    catch { }
                    lockClient = null;
                }
            }
        }
        try {
            const pipeline = workflowPipelineBuilder.compile(workflow);
            // Ensure all records carry universal row coordinates (_row_number, _task_id) and clean string keys
            const inputRows = (records || []).map((r, idx) => {
                const rowNum = Number(r._row_number ?? r.row_number ?? (idx + 1));
                const rowObj = {
                    ...r,
                    _row_number: rowNum,
                    _task_id: taskId,
                };
                for (const k of Object.keys(rowObj)) {
                    if (/utrnno|refnum|reference|terminal_id|tran_id|rrn|acct/i.test(k) && typeof rowObj[k] === 'number') {
                        rowObj[k] = String(rowObj[k]).trim();
                    }
                }
                return rowObj;
            });
            const batchCtx = {
                taskId,
                batchId: jobId,
                ruleBlockId: `rb-${workflow.id}`,
                stageId: '',
                stageName: '',
                totalRecords: inputRows.length,
                executionTimestamp: new Date().toISOString(),
            };
            const dbLookup = async (id) => repo.getDatabaseConnectionById(id);
            const batchReport = await pipeline.executeBatch(batchCtx, inputRows, dbLookup);
            // Phase 4: Map each input row to its individual evaluated outcome using batchReport.rowOutcomes
            const outcomeMap = new Map((batchReport.rowOutcomes || []).map((o) => [Number(o.rowNumber), o]));
            const evaluatedRecords = inputRows.map((r) => {
                const rowNum = Number(r._row_number);
                const outcome = outcomeMap.get(rowNum);
                const stepEntries = (workflow.stages && workflow.stages.length > 0)
                    ? workflow.stages.flatMap(stg => (stg.steps || []).map((st) => ({
                        ruleId: st.id,
                        ruleName: st.name || stg.name,
                        stageId: stg.id,
                        stageName: stg.name,
                        targetDb: stg.targetDbId || '',
                        targetTable: stg.targetDataSource || '',
                        validationResult: outcome?.validationStatus || 'PASS',
                        pipelineAction: outcome?.validationAction || 'CONTINUE',
                        executionTimestamp: new Date().toISOString(),
                        details: outcome?.details,
                    })))
                    : (workflow.steps || []).map((st) => ({
                        ruleId: st.id,
                        ruleName: st.name || workflow.name,
                        stageId: 'default-stage',
                        stageName: 'Default Stage',
                        targetDb: workflow.targetDbId || '',
                        targetTable: workflow.targetTable || '',
                        validationResult: outcome?.validationStatus || 'PASS',
                        pipelineAction: outcome?.validationAction || 'CONTINUE',
                        executionTimestamp: new Date().toISOString(),
                        details: outcome?.details,
                    }));
                return {
                    ...r,
                    _validation_status: outcome?.validationStatus || 'FAIL',
                    _validation_action: outcome?.validationAction || 'STOP',
                    _validation_details: outcome?.details || {
                        existence: 'UNPROCESSED_COORDINATE_IN_PIPELINE',
                        reason: 'Row coordinate was not processed or missing from pipeline stages',
                        totalEvaluated: batchReport.totalEvaluated,
                        passedCount: batchReport.passedCount,
                        failedCount: batchReport.failedCount,
                        stageResults: batchReport.stageResults,
                    },
                    _target_record: outcome?.targetRecord || r._target_record || null,
                    _validation_workflow_id: workflowId,
                    _validation_workflow_name: workflow.name,
                    auditTrail: stepEntries,
                };
            });
            eventService.broadcastEvent('workflow:completed', {
                jobId,
                workflowId,
                totalRecords: records.length,
                passedCount: batchReport.passedCount,
                failedCount: batchReport.failedCount,
                durationMs: Date.now() - startTime
            });
            if (sourceId) {
                try {
                    const resultMap = {};
                    for (const rec of evaluatedRecords) {
                        const k = String(rec.transaction_id ?? rec.id ?? rec._row_number);
                        const evalEntry = {
                            status: rec._validation_status,
                            action: rec._validation_action,
                            details: rec._validation_details,
                            targetRecord: rec._target_record,
                            auditTrail: rec.auditTrail,
                        };
                        resultMap[k] = evalEntry;
                        resultMap[`ROW-${rec._row_number}`] = evalEntry;
                    }
                    await repo.recordTaskWorkflowExecution({
                        taskId: sourceId,
                        workflowId,
                        workflowName: workflow.name,
                        status: 'COMPLETED',
                        totalRecords: records.length,
                        passedCount: batchReport.passedCount,
                        failedCount: batchReport.failedCount,
                        durationMs: Date.now() - startTime,
                        executedBy: envelope.executedBy || 'SYSTEM',
                        executionSummary: {
                            total: records.length,
                            passed: batchReport.passedCount,
                            failed: batchReport.failedCount,
                            totalCount: records.length,
                            passedCount: batchReport.passedCount,
                            failedCount: batchReport.failedCount,
                            results: resultMap,
                        },
                    });
                    await repo.updateTaskDatasetValidationStatus(sourceId, workflowId, workflow.name, evaluatedRecords.map((r) => ({
                        key: `ROW-${r._row_number}`,
                        status: r._validation_status,
                        details: r._validation_details,
                        targetRecord: r._target_record,
                        targetDb: workflow.targetDbId || '',
                        targetTable: workflow.targetTable || '',
                        auditTrail: r.auditTrail,
                        stageResults: r.auditTrail,
                    })));
                }
                catch (saveErr) {
                    console.warn(`[executeViaNewPipeline] Persistence notice: ${saveErr.message}`);
                }
            }
            return {
                jobId,
                sourceType: sourceType || 'DIRECT_API',
                workflowId,
                totalRecords: records.length,
                processedRecords: records.length,
                passedCount: batchReport.passedCount,
                failedCount: batchReport.failedCount,
                cachedHits: 0,
                durationMs: Date.now() - startTime,
                records: evaluatedRecords,
            };
        }
        finally {
            if (lockClient) {
                try {
                    await lockClient.query(`SELECT pg_advisory_unlock(('x' || substr(md5('task_exec_' || $1), 1, 16))::bit(64)::bigint)`, [sourceId]);
                }
                catch { }
                try {
                    lockClient.release();
                }
                catch { }
            }
        }
    },
    /**
     * Executes an investigation task across batched external queries,
     * PostgreSQL mirror persistence, and set-based relational reconciliation.
     */
    async executeInvestigationTask(taskId, workflow, extractions, transactions, keyField, options = {}) {
        const resolvedKey = keyField ||
            extractions.flatMap(e => (e.keyMappings || []).map(km => km.inputField)).find(Boolean) ||
            (workflow.steps || []).flatMap(s => (s.searchParameters || []).map(sp => sp.inputField)).find(Boolean) ||
            (transactions[0] ? Object.keys(transactions[0]).find(k => !k.startsWith('_')) : undefined);
        if (!resolvedKey) {
            throw new Error(`[WorkflowEngine] Investigation task ${taskId} aborted: No primary key field specified or discovered in transactions.`);
        }
        const effectiveKeyField = resolvedKey;
        const task = await repo.getInvestigationTaskById(taskId);
        if (!task)
            throw new Error(`Investigation task not found: ${taskId}`);
        const maxConcurrency = options.maxConcurrency || 5;
        const plan = task.executionPlan;
        if (!plan || !plan.batches || plan.batches.length === 0) {
            throw new Error(`Investigation task ${taskId} has no valid batch plan.`);
        }
        // Set task to RUNNING
        await repo.updateInvestigationTask(taskId, {
            status: 'RUNNING',
            startedAt: new Date().toISOString()
        });
        eventService.broadcastEvent('investigation:started', {
            taskId,
            totalBatches: plan.batches.length,
            totalTransactions: plan.transactionCount
        });
        // Track aggregate progress
        let processedTotal = 0;
        let reconciledTotal = 0;
        let flaggedTotal = 0;
        let failedTotal = 0;
        // Compile the pipeline once for all batches (Phase 1, Phase 16)
        const pipeline = workflowPipelineBuilder.compile(workflow);
        const dbLookup = async (id) => repo.getDatabaseConnectionById(id);
        // Process batches in bounded concurrent windows
        const batches = plan.batches;
        for (let i = 0; i < batches.length; i += maxConcurrency) {
            const windowBatches = batches.slice(i, i + maxConcurrency);
            await Promise.all(windowBatches.map(async (batchPlan) => {
                const batchId = batchPlan.batchId;
                // 1. Mark batch RUNNING
                await repo.updateInvestigationBatch(batchId, {
                    status: 'RUNNING',
                    startedAt: new Date().toISOString()
                });
                try {
                    const txIdSet = new Set(batchPlan.transactionIds.map(String));
                    const batchTxns = (transactions || []).filter((t) => {
                        const tid = String(t.transactionId ?? t.id ?? (effectiveKeyField ? t[effectiveKeyField] : '') ?? t._row_number);
                        return txIdSet.has(tid);
                    });
                    const sourceList = batchTxns.length > 0 ? batchTxns : batchPlan.transactionIds.map((id, idx) => ({
                        ...(effectiveKeyField ? { [effectiveKeyField]: id } : { transaction_id: id }),
                        _row_number: idx + 1,
                    }));
                    const inputRows = sourceList.map((r, idx) => ({
                        ...r,
                        _row_number: Number(r._row_number ?? r.row_number ?? (idx + 1)),
                        _task_id: taskId,
                    }));
                    const batchCtx = {
                        taskId,
                        batchId,
                        ruleBlockId: `rb-${workflow.id}`,
                        stageId: '',
                        stageName: '',
                        totalRecords: inputRows.length,
                        executionTimestamp: new Date().toISOString(),
                    };
                    const batchReport = await pipeline.executeBatch(batchCtx, inputRows, dbLookup);
                    const outcomeMap = new Map((batchReport.rowOutcomes || []).map((o) => [Number(o.rowNumber), o]));
                    for (const r of inputRows) {
                        const rowNum = Number(r._row_number);
                        const outcome = outcomeMap.get(rowNum);
                        const isPass = outcome ? outcome.validationStatus === 'PASS' : (batchReport.failedCount === 0);
                        const txId = String(r.transactionId ?? r.id ?? (effectiveKeyField ? r[effectiveKeyField] : '') ?? rowNum);
                        const invTx = {
                            id: `itx-${taskId}-${txId}`,
                            taskId,
                            batchId,
                            transactionId: txId,
                            investigationStatus: isPass ? 'RECONCILED' : 'FLAGGED_DISCREPANCY',
                            statusFlagText: isPass ? 'Matched in External DB' : 'Reconciliation Discrepancy',
                            statusFlagColor: isPass ? 'green' : 'amber',
                            finalResult: outcome?.validationStatus || (isPass ? 'PASS' : 'FAIL'),
                            finalAction: outcome?.validationAction || (isPass ? 'CONTINUE' : 'FLAG'),
                            auditTrail: outcome?.details ? [outcome.details] : [],
                            updatedAt: new Date().toISOString()
                        };
                        await repo.createInvestigationTransaction(invTx);
                    }
                    reconciledTotal += batchReport.passedCount;
                    flaggedTotal += batchReport.failedCount;
                    processedTotal += batchPlan.transactionIds.length;
                    // Complete batch
                    await repo.updateInvestigationBatch(batchId, {
                        status: 'COMPLETED',
                        processedCount: batchPlan.transactionIds.length,
                        completedAt: new Date().toISOString()
                    });
                    // Broadcast SSE batch progress
                    eventService.broadcastEvent('investigation:batch_completed', {
                        taskId,
                        batchId,
                        processed: processedTotal,
                        total: plan.transactionCount,
                        reconciled: reconciledTotal,
                        flagged: flaggedTotal
                    });
                }
                catch (batchErr) {
                    console.error(`Error processing batch ${batchId}:`, batchErr.message);
                    failedTotal += batchPlan.transactionIds.length;
                    await repo.updateInvestigationBatch(batchId, {
                        status: 'FAILED',
                        errorDetail: batchErr.message,
                        completedAt: new Date().toISOString()
                    });
                }
            }));
        }
        // Mark task COMPLETED
        const finalTaskStatus = failedTotal === 0 ? 'COMPLETED' : (reconciledTotal > 0 ? 'PARTIAL' : 'FAILED');
        const updatedTask = await repo.updateInvestigationTask(taskId, {
            status: finalTaskStatus,
            processedTransactions: processedTotal,
            reconciledTransactions: reconciledTotal,
            flaggedTransactions: flaggedTotal,
            failedTransactions: failedTotal,
            completedAt: new Date().toISOString()
        });
        eventService.broadcastEvent('investigation:completed', {
            taskId,
            status: finalTaskStatus,
            processedTransactions: processedTotal,
            reconciledTransactions: reconciledTotal,
            flaggedTransactions: flaggedTotal
        });
        return updatedTask;
    }
};
