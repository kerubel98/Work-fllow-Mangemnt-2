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
import { reconciliationService } from './reconciliationService.js';
import { dbLivenessService } from './dbLivenessService.js';
import { mirrorTableManager } from './mirrorTableManager.js';
import { ruleSqlCompiler } from './ruleSqlCompiler.js';
import { workflowEngineSingleton } from './workflowEngineSingleton.js';
import { queryPg } from '../config/postgres.js';
export const investigationOrchestratorService = {
    /**
     * Universal Workflow Execution Engine.
     * Accepts arbitrary payloads from any caller (Investigation Panel or Query Sandbox),
     * deduplicates in-flight records, probes database liveness, provisions typed mirror tables,
     * compiles rules into dynamic SQL, and executes event-driven key chaining.
     */
    async executeUniversalWorkflow(envelope) {
        const startTime = Date.now();
        const { workflowId, records, sourceType, sourceId, keyField: inputKeyField, keyFields: inputKeyFields, forceRerun, executedBy } = envelope;
        const workflow = await repo.getWorkflowById(workflowId);
        if (!workflow) {
            throw new Error(`Workflow with ID '${workflowId}' not found.`);
        }
        // Discover ALL parameters configured by the user across this workflow's validation boxes
        // (searchParameters[].inputField, requiredParams, optionalParams, sourceField, canonicalField).
        // Never fall back to hardcoded field names (e.g. transaction_id, retrieval_ref_num).
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
                registerParam(step.sourceField);
                registerParam(step.canonicalField);
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
        // Determine primary keyField and full list of active parameters
        const resolvedKey = activeParamsInFile[0] || inputKeyField || fileColumns.find(c => !c.startsWith('_'));
        if (!resolvedKey) {
            throw new Error(`[WorkflowEngine] Configuration Error: Unable to determine primary key for workflow "${workflow.name}". Please configure searchParameters on workflow steps or supply an explicit keyField.`);
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
        const finalEvaluatedRecords = [];
        // Append cached results directly
        for (const hit of cacheHits) {
            finalEvaluatedRecords.push({
                ...hit.record,
                _validation_status: hit.cached.verdict,
                _is_cached: true,
                _cached_at: new Date(hit.cached.cachedAt).toISOString()
            });
            if (hit.cached.verdict === 'PASS')
                totalPassed++;
            else
                totalFailed++;
        }
        // Wait on any in-flight promises from other users
        if (inFlight.length > 0) {
            const inFlightResults = await Promise.allSettled(inFlight.map(i => i.promise));
            for (let i = 0; i < inFlight.length; i++) {
                const item = inFlight[i];
                const res = inFlightResults[i];
                if (res.status === 'fulfilled' && res.value) {
                    finalEvaluatedRecords.push(res.value);
                    if (res.value._validation_status === 'PASS')
                        totalPassed++;
                    else
                        totalFailed++;
                }
                else {
                    finalEvaluatedRecords.push({
                        ...item.record,
                        _validation_status: 'FAIL',
                        _error: 'In-flight execution failed'
                    });
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
                records: finalEvaluatedRecords
            };
        }
        // Register in-flight locks for fresh records
        const jobPromise = (async () => {
            // Execute Stages with Key Chaining and Liveness Checks
            let currentActiveKeys = toExecute.map((r, idx) => getRecordCandidateKeys(r, idx)[0]);
            let currentActiveRecords = [...toExecute];
            let previousMirrorTable = null;
            for (let stageIdx = 0; stageIdx < stages.length; stageIdx++) {
                const stage = stages[stageIdx];
                const stageSteps = steps.filter(s => s.stageId === stage.id || (!s.stageId && stageIdx === 0));
                // Hydrate database table column configurations for stage steps (Complete Checks)
                for (const step of stageSteps) {
                    if ((!step.columnConfigurations || step.columnConfigurations.length === 0) && step.columnConfigurationIds && step.columnConfigurationIds.length > 0) {
                        const configs = await Promise.all(step.columnConfigurationIds.map(id => repo.getColumnConfigurationById(id)));
                        step.columnConfigurations = configs.filter((c) => c !== null);
                    }
                    else if ((!step.columnConfigurations || step.columnConfigurations.length === 0) && (step.targetDbId || stage.targetDbId) && (step.targetTable || stage.targetDataSource)) {
                        try {
                            const tableConfigs = await repo.getColumnConfigurations(step.targetDbId || stage.targetDbId, step.targetTable || stage.targetDataSource);
                            if (tableConfigs.length > 0) {
                                step.columnConfigurations = tableConfigs;
                            }
                        }
                        catch { }
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
                            const txKey = getRecordCandidateKeys(r, rIdx)[0] || '';
                            finalEvaluatedRecords.push({
                                ...r,
                                _validation_status: 'PAUSED_DB_OFFLINE',
                                _validation_details: { circuitBreaker: 'OPEN', error: liveness.error },
                                _evaluated_at: new Date().toISOString()
                            });
                            totalFailed++;
                            if (txKey) {
                                workflowEngineSingleton.cacheResult(workflowId, txKey, 'PAUSED_DB_OFFLINE', 'PAUSED_DB_OFFLINE', { circuitBreaker: 'OPEN', error: liveness.error });
                            }
                        }
                        break;
                    }
                }
                // 3. Key Chaining: Discover Downstream Primary Keys from Upstream Mirror
                let effectiveQueryKeys = currentActiveKeys;
                if (previousMirrorTable && stageIdx > 0) {
                    try {
                        const previousCols = await mirrorTableManager.getMirrorColumns(previousMirrorTable);
                        // Priority 1: Use keyMappings from the current stage's QueryExtraction if available
                        const stageExtractions = (await repo.getQueryExtractionsByWorkflowId(workflow.id))
                            .filter((qe) => qe.stageId === stage.id && qe.enabled !== false);
                        const extractionKeys = stageExtractions
                            .flatMap((qe) => (qe.keyMappings || []).map(km => km.sourceField))
                            .filter((k) => k && previousCols.includes(k));
                        // Priority 2: Use searchParameters from the current stage's steps that match previous mirror columns
                        const stageStepKeys = stageSteps
                            .flatMap((step) => (step.searchParameters || []).map((sp) => sp.targetColumn || sp.inputField))
                            .filter((k) => k && previousCols.includes(k));
                        const candidateKeys = extractionKeys.length > 0 ? extractionKeys : stageStepKeys;
                        const discoveredKey = candidateKeys.find((k) => previousCols.includes(k));
                        if (discoveredKey) {
                            console.log(`[WorkflowEngine] Key Chaining: Auto-discovered downstream key '${discoveredKey}' in ${previousMirrorTable}`);
                            const chainQuery = `
                SELECT DISTINCT ${discoveredKey} as key_val 
                FROM ${previousMirrorTable} 
                WHERE _batch_id = $1 AND _validation_status = 'PASS' AND ${discoveredKey} IS NOT NULL
              `;
                            const chainRes = await queryPg(chainQuery, [jobId]);
                            if (chainRes.rows.length > 0) {
                                effectiveQueryKeys = chainRes.rows.map((r) => String(r.key_val));
                                console.log(`[WorkflowEngine] Key Chaining: Extracted ${effectiveQueryKeys.length} primary keys for stage ${stage.name}.`);
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
                // Build the extraction using ALL searchParameters configured across the stage's steps
                // AND all parameters present in the uploaded file.
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
                // Add all activeKeyFields present in the file
                for (const kf of activeKeyFields) {
                    if (!seenInputs.has(kf.toLowerCase())) {
                        seenInputs.add(kf.toLowerCase());
                        stageSearchParams.push({ inputField: kf, targetColumn: kf, required: true });
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
                            if (!seenMirrorKeys.has(primaryVal)) {
                                seenMirrorKeys.add(primaryVal);
                                recordsToMirror.push({
                                    [primaryKeyField]: primaryVal,
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
                const hasKeyCol = mirrorCols.includes(primaryKeyField);
                const hasPayloadCol = mirrorCols.includes('payload');
                const keyExpr = hasKeyCol
                    ? `${primaryKeyField}::text`
                    : (hasPayloadCol ? `COALESCE(payload->>'${primaryKeyField}', _mirror_id::text)` : `_mirror_id::text`);
                const partitionQuery = `
          SELECT ${keyExpr} as tx_key, _validation_status, _validation_action, _validation_details 
          FROM ${mirrorTable} 
          WHERE _batch_id = $1
        `;
                const partitionRes = await queryPg(partitionQuery, [jobId]);
                const partitionMap = new Map();
                partitionRes.rows.forEach((r) => partitionMap.set(String(r.tx_key), r));
                const forwardKeys = [];
                const passKeys = [];
                const failKeys = [];
                const processedKeysInStage = new Set();
                for (let recIdx = 0; recIdx < stageInputRecords.length; recIdx++) {
                    const orig = stageInputRecords[recIdx];
                    const candidateKeys = getRecordCandidateKeys(orig, recIdx);
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
                        const canAdvance = isPass || (matchedPartitionRow._validation_status === 'FAIL' && (action === 'CONTINUE' || action === 'REPORT'));
                        if (canAdvance) {
                            forwardKeys.push(keyStr);
                        }
                        const isHalted = !isPass && action !== 'CONTINUE' && action !== 'REPORT';
                        const isLastStage = stageIdx === stages.length - 1;
                        if (isLastStage || isHalted) {
                            let targetRec = null;
                            if (externalResult?.correlatedRecords) {
                                for (const k of candidateKeys) {
                                    if (externalResult.correlatedRecords[k]) {
                                        targetRec = externalResult.correlatedRecords[k];
                                        break;
                                    }
                                }
                            }
                            finalEvaluatedRecords.push({
                                ...orig,
                                _validation_status: matchedPartitionRow._validation_status,
                                _validation_action: matchedPartitionRow._validation_action,
                                _validation_details: matchedPartitionRow._validation_details,
                                _isDiagnosticOnly: orig?._isDiagnosticOnly || false,
                                _target_record: targetRec || null,
                                _target_db: targetDb?.name || stage.targetDbId || 'Target DB',
                                _target_table: targetTable,
                                _evaluated_at: new Date().toISOString()
                            });
                            if (isPass)
                                totalPassed++;
                            else
                                totalFailed++;
                            if (!shouldForceFresh) {
                                workflowEngineSingleton.cacheResult(workflowId, keyStr, isPass ? 'PASS' : 'FAIL', matchedPartitionRow._validation_status, matchedPartitionRow._validation_details);
                            }
                        }
                    }
                    else {
                        // CRITICAL: Record was NOT found in target database / mirror!
                        // A rule should NEVER say passed for a record not found in the external database!
                        const recKey = candidateKeys[0] || `ROW-${recIdx + 1}`;
                        failKeys.push(recKey);
                        const failDetails = {
                            existence: 'NOT_FOUND_IN_TARGET_DB',
                            message: `Record not found in target database ${targetDb?.name || stage.targetDbId || 'Target DB'} (${targetTable})`
                        };
                        finalEvaluatedRecords.push({
                            ...orig,
                            _validation_status: 'FAIL',
                            _validation_action: stageSteps[0]?.onFailAction || 'STOP',
                            _validation_details: failDetails,
                            _isDiagnosticOnly: orig?._isDiagnosticOnly || false,
                            _target_record: null,
                            _target_db: targetDb?.name || stage.targetDbId || 'Target DB',
                            _target_table: targetTable,
                            _evaluated_at: new Date().toISOString()
                        });
                        totalFailed++;
                        if (!shouldForceFresh) {
                            workflowEngineSingleton.cacheResult(workflowId, recKey, 'FAIL', 'FAIL', failDetails);
                        }
                    }
                }
                console.log(`[WorkflowEngine] Stage '${stage.name}' completed: ${passKeys.length} passed, ${failKeys.length} failed, ${forwardKeys.length} forwarded downstream.`);
                eventService.broadcastEvent('workflow:stage_completed', {
                    jobId,
                    stageId: stage.id,
                    stageName: stage.name,
                    passedCount: passKeys.length,
                    failedCount: failKeys.length,
                    forwardedCount: forwardKeys.length,
                    mirrorTable
                });
                // 8. Event-Driven Chaining: Route forward subset to next stage
                currentActiveKeys = forwardKeys;
                currentActiveRecords = stageInputRecords.filter((r, idx) => {
                    const rKeys = getRecordCandidateKeys(r, idx);
                    return rKeys.some(k => forwardKeys.includes(k));
                });
                // Tainted State Tracking: if a record failed with action REPORT, tag as diagnostic-only so downstream arithmetic is bypassed
                currentActiveRecords.forEach((r, idx) => {
                    const rKeys = getRecordCandidateKeys(r, idx);
                    const matchedRow = partitionRes.rows.find((pr) => rKeys.includes(String(pr.tx_key)));
                    if (matchedRow && matchedRow._validation_status === 'FAIL' && matchedRow._validation_action === 'REPORT') {
                        r._isDiagnosticOnly = true;
                        r._diagnosticTaintReason = matchedRow._validation_details?.message || 'Upstream stage validation failed';
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
                records: finalEvaluatedRecords
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
                        targetTable: rec._target_table || null
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
                    targetTable: r._target_table || null
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
                    // 2. Pre-populate investigation_transactions for this batch
                    for (const txId of batchPlan.transactionIds) {
                        const invTx = {
                            id: `itx-${taskId}-${txId}`,
                            taskId,
                            batchId,
                            transactionId: txId,
                            investigationStatus: 'IN_PROGRESS',
                            statusFlagText: 'Querying external DB...',
                            statusFlagColor: 'blue',
                            finalResult: 'NOT_EVALUATED',
                            finalAction: 'CONTINUE',
                            auditTrail: [],
                            updatedAt: new Date().toISOString()
                        };
                        await repo.createInvestigationTransaction(invTx);
                    }
                    // 3. For each stage query chunk in the batch, fetch external records
                    for (const chunk of batchPlan.queryChunks) {
                        const extraction = extractions[0] || {
                            id: `ext-${taskId}`,
                            workflowId: workflow.id,
                            stageId: 'stage-1',
                            targetDbId: workflow.targetDbId || '',
                            targetDataSource: workflow.targetTable || '',
                            selectedColumns: [],
                            keyMappings: [{ inputField: effectiveKeyField, sourceField: effectiveKeyField, required: true }],
                            enabled: true
                        };
                        // Probe Liveness
                        const targetDb = await repo.getDatabaseConnectionById(extraction.targetDbId);
                        if (targetDb) {
                            const liveness = await dbLivenessService.probeLiveness(targetDb, 3000);
                            if (!liveness.isAlive) {
                                console.warn(`[InvestigationTask] Liveness probe warning for ${targetDb.name}: ${liveness.error}`);
                            }
                        }
                        const externalResult = await executeExternalChunkQuery(extraction, chunk, options.inMemoryRecords || transactions);
                        if (externalResult.success) {
                            // 4. Persist to transient PostgreSQL external mirror
                            const mirrorRecords = Object.entries(externalResult.correlatedRecords).map(([k, v]) => ({
                                recordKey: k,
                                canonicalPayload: v
                            }));
                            await reconciliationService.persistExternalMirrorBatch(taskId, extraction.id, extraction.targetDbId || 'EXTERNAL_DB', mirrorRecords);
                            // 5. Execute set-based relational reconciliation in PostgreSQL
                            const reconOutcome = await reconciliationService.reconcileBatchInDatabase(taskId, batchId, extraction.id, effectiveKeyField);
                            reconciledTotal += reconOutcome.passCount;
                            flaggedTotal += reconOutcome.failCount;
                            failedTotal += reconOutcome.errorCount;
                        }
                        else {
                            failedTotal += batchPlan.transactionIds.length;
                        }
                    }
                    processedTotal += batchPlan.transactionIds.length;
                    // 6. Complete batch
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
