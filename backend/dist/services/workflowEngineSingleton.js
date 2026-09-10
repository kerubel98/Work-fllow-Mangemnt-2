/**
 * Master Workflow Engine Singleton & Central Task Scheduler
 * Coordinates execution across callers (Investigation Panel, DB Query Sandbox, API),
 * manages in-flight locks to eliminate duplicate queries across users,
 * provides idempotent result caching with TTL, and dispatches fair-share queues.
 */
import { EventEmitter } from 'events';
class WorkflowEngineSingleton extends EventEmitter {
    // In-flight transaction lock manager: maps key -> Active Promise
    inFlightLocks = new Map();
    // Idempotent result cache: key -> Cached Result
    resultCache = new Map();
    // Default cache TTL: 15 minutes
    defaultTtlMs = 15 * 60 * 1000;
    constructor() {
        super();
        this.setMaxListeners(100);
    }
    /**
     * Generates a cache key for a transaction within a workflow.
     */
    getCacheKey(workflowId, txKey) {
        return `${workflowId}:${txKey}`;
    }
    /**
     * Checks if an idempotent cached result exists and is still valid.
     */
    getCachedResult(workflowId, txKey) {
        const key = this.getCacheKey(workflowId, txKey);
        const cached = this.resultCache.get(key);
        if (!cached)
            return null;
        if (Date.now() - cached.cachedAt > this.defaultTtlMs) {
            this.resultCache.delete(key);
            return null;
        }
        return cached;
    }
    /**
     * Stores a transaction validation result in the cache.
     */
    cacheResult(workflowId, txKey, verdict, status, audit) {
        const key = this.getCacheKey(workflowId, txKey);
        this.resultCache.set(key, {
            transactionKey: txKey,
            workflowId,
            status,
            verdict,
            audit,
            cachedAt: Date.now()
        });
    }
    /**
     * Checks if a transaction is currently in-flight.
     * If yes, returns the active promise to avoid duplicate database queries.
     */
    getInFlightLock(workflowId, txKey) {
        const key = this.getCacheKey(workflowId, txKey);
        return this.inFlightLocks.get(key) || null;
    }
    /**
     * Registers an active in-flight transaction lock.
     */
    registerInFlightLock(workflowId, txKey, promise) {
        const key = this.getCacheKey(workflowId, txKey);
        this.inFlightLocks.set(key, promise);
        promise.catch(() => { }).finally(() => {
            this.inFlightLocks.delete(key);
        });
    }
    /**
     * Filters an incoming batch of transactions into:
     * 1. Cache hits (instant results)
     * 2. In-flight duplicates (attached to running promises)
     * 3. Fresh unique transactions (must execute)
     */
    partitionIncomingTransactions(workflowId, records, keyField = 'retrieval_ref_num') {
        const cacheHits = [];
        const inFlight = [];
        const toExecute = [];
        for (const rec of records) {
            const txKey = String(rec[keyField] || rec.transaction_id || rec.id || '');
            if (!txKey) {
                toExecute.push(rec);
                continue;
            }
            const cached = this.getCachedResult(workflowId, txKey);
            if (cached) {
                cacheHits.push({ record: rec, cached });
                continue;
            }
            const inFlightPromise = this.getInFlightLock(workflowId, txKey);
            if (inFlightPromise) {
                inFlight.push({ record: rec, promise: inFlightPromise });
                continue;
            }
            toExecute.push(rec);
        }
        return { cacheHits, inFlight, toExecute };
    }
}
export const workflowEngineSingleton = new WorkflowEngineSingleton();
