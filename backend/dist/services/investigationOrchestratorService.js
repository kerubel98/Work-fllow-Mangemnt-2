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
        const { workflowId, records, sourceType, sourceId, keyField = 'retrieval_ref_num' } = envelope;
        const workflow = await repo.getWorkflowById(workflowId);
        if (!workflow) {
            throw new Error(`Workflow with ID '${workflowId}' not found.`);
        }
        const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        console.log(`[WorkflowEngine] Starting job ${jobId} from ${sourceType} with ${records.length} records.`);
        // 1. Singleton In-Flight Deduplication & Idempotent Cache Check
        const { cacheHits, inFlight, toExecute } = workflowEngineSingleton.partitionIncomingTransactions(workflowId, records, keyField);
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
        const stages = (workflow.stages || []).filter(s => s.enabled);
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
            let currentActiveKeys = toExecute.map((r, idx) => String(r[keyField] ?? r.transaction_id ?? r.id ?? `TX-${idx + 1}`));
            let currentActiveRecords = [...toExecute];
            let previousMirrorTable = null;
            for (let stageIdx = 0; stageIdx < stages.length; stageIdx++) {
                const stage = stages[stageIdx];
                const stageSteps = steps.filter(s => s.stageId === stage.id || (!s.stageId && stageIdx === 0));
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
                        for (const r of currentActiveRecords) {
                            const txKey = String(r[keyField] ?? r.transaction_id ?? r.id ?? '');
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
                        // Check if previous mirror table contains the primary key or foreign key of this stage
                        const candidateKeys = ['settlement_id', 'clearing_sequence_id', 'batch_id', 'order_id', 'account_id'];
                        const discoveredKey = candidateKeys.find(k => previousCols.includes(k));
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
                let mirrorTable;
                try {
                    mirrorTable = await mirrorTableManager.ensureMirrorTableExists(targetDb, stage.targetDataSource || 'transactions');
                }
                catch (mirrorErr) {
                    console.warn(`[WorkflowEngine] Fallback to standard staging mirror: ${mirrorErr.message}`);
                    mirrorTable = await mirrorTableManager.ensureMirrorTableExists(null, 'staging_transactions');
                }
                // 5. Fetch External Data & Ingest to Mirror
                const extraction = {
                    id: `ext-${jobId}-${stage.id}`,
                    workflowId: workflow.id,
                    stageId: stage.id,
                    targetDbId: stage.targetDbId || workflow.targetDbId || '',
                    targetDataSource: stage.targetDataSource || workflow.targetTable || 'transactions',
                    selectedColumns: [],
                    keyMappings: [{ inputField: keyField, sourceField: keyField, required: true }],
                    enabled: true
                };
                const externalResult = await executeExternalChunkQuery(extraction, { chunkId: `chunk-${jobId}-01`, sequence: 1, transactionIds: effectiveQueryKeys }, currentActiveRecords);
                if (externalResult.success) {
                    const recordsToMirror = Object.entries(externalResult.correlatedRecords).map(([k, v]) => ({
                        [keyField]: k,
                        ...v
                    }));
                    await mirrorTableManager.bulkInsertToMirror(mirrorTable, jobId, stage.id, recordsToMirror);
                }
                // 6. Dynamic Rule-to-SQL Compilation & Evaluation
                const mirrorCols = await mirrorTableManager.getMirrorColumns(mirrorTable);
                const compiledSql = ruleSqlCompiler.compileBlockUpdateSql(mirrorTable, keyField, stageSteps, mirrorCols);
                // Execute compiled set-based batch update
                await queryPg(compiledSql.fullUpdateSql, [jobId]);
                // 7. Segregate Passed vs. Failed Partitions
                const hasKeyCol = mirrorCols.includes(keyField);
                const keyExpr = hasKeyCol ? `${keyField}::text` : `COALESCE(payload->>'${keyField}', payload->>'transaction_id', _mirror_id::text)`;
                const partitionQuery = `
          SELECT ${keyExpr} as tx_key, _validation_status, _validation_details 
          FROM ${mirrorTable} 
          WHERE _batch_id = $1
        `;
                const partitionRes = await queryPg(partitionQuery, [jobId]);
                const passKeys = [];
                const failKeys = [];
                partitionRes.rows.forEach((r) => {
                    if (r._validation_status === 'PASS') {
                        passKeys.push(String(r.tx_key));
                    }
                    else {
                        failKeys.push(String(r.tx_key));
                    }
                });
                console.log(`[WorkflowEngine] Stage '${stage.name}' completed: ${passKeys.length} passed, ${failKeys.length} failed.`);
                eventService.broadcastEvent('workflow:stage_completed', {
                    jobId,
                    stageId: stage.id,
                    stageName: stage.name,
                    passedCount: passKeys.length,
                    failedCount: failKeys.length,
                    mirrorTable
                });
                // 8. Event-Driven Chaining: Route passed subset to next stage
                currentActiveKeys = passKeys;
                currentActiveRecords = currentActiveRecords.filter(r => passKeys.includes(String(r[keyField] ?? r.transaction_id ?? r.id)));
                previousMirrorTable = mirrorTable;
                // Collect final outcomes
                partitionRes.rows.forEach((r) => {
                    const orig = toExecute.find(o => String(o[keyField] ?? o.transaction_id ?? o.id) === String(r.tx_key));
                    const verdict = r._validation_status === 'PASS' ? 'PASS' : 'FAIL';
                    if (stageIdx === stages.length - 1 || r._validation_status !== 'PASS') {
                        finalEvaluatedRecords.push({
                            ...(orig || {}),
                            _validation_status: r._validation_status,
                            _validation_details: r._validation_details,
                            _evaluated_at: new Date().toISOString()
                        });
                        if (verdict === 'PASS')
                            totalPassed++;
                        else
                            totalFailed++;
                        // Cache result in singleton
                        workflowEngineSingleton.cacheResult(workflowId, String(r.tx_key), verdict, r._validation_status, r._validation_details);
                    }
                });
                // If no records passed, terminate pipeline early
                if (currentActiveKeys.length === 0) {
                    console.log(`[WorkflowEngine] No records passed stage '${stage.name}'. Terminating pipeline early.`);
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
        for (const rec of toExecute) {
            const k = String(rec[keyField] ?? rec.transaction_id ?? rec.id ?? '');
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
        return result;
    },
    /**
     * Executes an investigation task across batched external queries,
     * PostgreSQL mirror persistence, and set-based relational reconciliation.
     */
    async executeInvestigationTask(taskId, workflow, extractions, transactions, keyField = 'retrievalRefNum', options = {}) {
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
                            keyMappings: [{ inputField: keyField, sourceField: keyField, required: true }],
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
                            const reconOutcome = await reconciliationService.reconcileBatchInDatabase(taskId, batchId, extraction.id, keyField);
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
