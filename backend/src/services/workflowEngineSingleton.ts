/**
 * Master Workflow Engine Singleton & Central Task Scheduler
 * Coordinates execution across callers (Investigation Panel, DB Query Sandbox, API),
 * manages in-flight locks to eliminate duplicate queries across users,
 * provides idempotent result caching with TTL, and dispatches fair-share queues.
 */

import { EventEmitter } from 'events';
import { DatabaseValidationWorkflow } from '../types.js';

export interface ValidationPayloadEnvelope {
  sourceType: 'INVESTIGATION_PANEL' | 'QUERY_SANDBOX' | 'DIRECT_API';
  sourceId?: string;
  workflowId: string;
  records: Record<string, any>[];
  keyField?: string;
  keyFields?: string[];
  priority?: 'HIGH' | 'NORMAL';
  forceRerun?: boolean;
  options?: {
    persistMirror?: boolean;
    ttlMinutes?: number;
    dryRun?: boolean;
    maxConcurrency?: number;
  };
}

export interface CachedValidationResult {
  transactionKey: string;
  workflowId: string;
  status: string;
  verdict: 'PASS' | 'FAIL' | 'DISCREPANCY' | 'PAUSED_DB_OFFLINE';
  audit: any;
  cachedAt: number;
}

export interface WorkflowJobResult {
  jobId: string;
  sourceType: string;
  workflowId: string;
  totalRecords: number;
  processedRecords: number;
  passedCount: number;
  failedCount: number;
  cachedHits: number;
  durationMs: number;
  records: any[];
}

class WorkflowEngineSingleton extends EventEmitter {
  // In-flight transaction lock manager: maps key -> Active Promise
  private inFlightLocks = new Map<string, Promise<any>>();

  // Idempotent result cache: key -> Cached Result
  private resultCache = new Map<string, CachedValidationResult>();

  // Default cache TTL: 15 minutes
  private defaultTtlMs = 15 * 60 * 1000;

  constructor() {
    super();
    this.setMaxListeners(100);
  }

  /**
   * Generates a cache key for a transaction within a workflow.
   */
  private getCacheKey(workflowId: string, txKey: string): string {
    return `${workflowId}:${txKey}`;
  }

  /**
   * Checks if an idempotent cached result exists and is still valid.
   */
  public getCachedResult(workflowId: string, txKey: string): CachedValidationResult | null {
    const key = this.getCacheKey(workflowId, txKey);
    const cached = this.resultCache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.cachedAt > this.defaultTtlMs) {
      this.resultCache.delete(key);
      return null;
    }

    return cached;
  }

  /**
   * Invalidates or evicts cached results for specific keys or an entire workflow.
   */
  public evictCache(workflowId: string, txKeys?: string[]): void {
    if (txKeys && txKeys.length > 0) {
      for (const k of txKeys) {
        this.resultCache.delete(this.getCacheKey(workflowId, k));
      }
    } else {
      for (const [key] of this.resultCache) {
        if (key.startsWith(`${workflowId}:`)) {
          this.resultCache.delete(key);
        }
      }
    }
  }

  /**
   * Stores a transaction validation result in the cache.
   */
  public cacheResult(workflowId: string, txKey: string, verdict: 'PASS' | 'FAIL' | 'DISCREPANCY' | 'PAUSED_DB_OFFLINE', status: string, audit: any): void {
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
  public getInFlightLock(workflowId: string, txKey: string): Promise<any> | null {
    const key = this.getCacheKey(workflowId, txKey);
    return this.inFlightLocks.get(key) || null;
  }

  /**
   * Registers an active in-flight transaction lock.
   */
  public registerInFlightLock(workflowId: string, txKey: string, promise: Promise<any>): void {
    const key = this.getCacheKey(workflowId, txKey);
    this.inFlightLocks.set(key, promise);
    promise.catch(() => {}).finally(() => {
      this.inFlightLocks.delete(key);
    });
  }

  /**
   * Filters an incoming batch of transactions into:
   * 1. Cache hits (instant results)
   * 2. In-flight duplicates (attached to running promises)
   * 3. Fresh unique transactions (must execute)
   */
  public partitionIncomingTransactions(
    workflowId: string,
    records: Record<string, any>[],
    keyField = 'retrieval_ref_num'
  ): {
    cacheHits: { record: Record<string, any>; cached: CachedValidationResult }[];
    inFlight: { record: Record<string, any>; promise: Promise<any> }[];
    toExecute: Record<string, any>[];
  } {
    const cacheHits: { record: Record<string, any>; cached: CachedValidationResult }[] = [];
    const inFlight: { record: Record<string, any>; promise: Promise<any> }[] = [];
    const toExecute: Record<string, any>[] = [];

    for (const rec of records) {
      const txKey = String(
        (keyField && rec[keyField]) ||
        rec.transaction_id ||
        rec.transactionId ||
        rec.retrieval_ref_num ||
        rec.retrievalRefNum ||
        rec.refnum ||
        rec.rrn ||
        rec.id ||
        rec.card_number ||
        ''
      );
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
