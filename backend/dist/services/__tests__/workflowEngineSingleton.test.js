import { describe, it, expect, beforeEach } from 'vitest';
import { workflowEngineSingleton } from '../workflowEngineSingleton.js';
describe('workflowEngineSingleton', () => {
    const workflowId = 'test-wf-1';
    beforeEach(() => {
        workflowEngineSingleton.evictCache(workflowId);
    });
    it('partitions incoming transactions into fresh execution and cache hits', () => {
        const tx1 = { transaction_id: 'TX-100', amount: 50 };
        const tx2 = { transaction_id: 'TX-200', amount: 75 };
        // Initial partition: both fresh
        const firstPartition = workflowEngineSingleton.partitionIncomingTransactions(workflowId, [tx1, tx2], 'transaction_id');
        expect(firstPartition.toExecute.length).toBe(2);
        expect(firstPartition.cacheHits.length).toBe(0);
        // Cache tx1 outcome
        workflowEngineSingleton.cacheResult(workflowId, 'TX-100', 'PASS', 'PASS', { matched: true });
        // Second partition: tx1 is cached, tx2 is fresh
        const secondPartition = workflowEngineSingleton.partitionIncomingTransactions(workflowId, [tx1, tx2], 'transaction_id');
        expect(secondPartition.cacheHits.length).toBe(1);
        expect(secondPartition.cacheHits[0].record.transaction_id).toBe('TX-100');
        expect(secondPartition.cacheHits[0].cached.verdict).toBe('PASS');
        expect(secondPartition.toExecute.length).toBe(1);
        expect(secondPartition.toExecute[0].transaction_id).toBe('TX-200');
    });
    it('evicts cache entries on demand when resuming paused transactions', () => {
        workflowEngineSingleton.cacheResult(workflowId, 'TX-PAUSED', 'PAUSED_DB_OFFLINE', 'PAUSED_DB_OFFLINE', { circuit: 'OPEN' });
        expect(workflowEngineSingleton.getCachedResult(workflowId, 'TX-PAUSED')).not.toBeNull();
        // Evict specific key
        workflowEngineSingleton.evictCache(workflowId, ['TX-PAUSED']);
        expect(workflowEngineSingleton.getCachedResult(workflowId, 'TX-PAUSED')).toBeNull();
    });
    it('handles in-flight promises avoiding duplicate execution across concurrent requests', async () => {
        let resolvePromise;
        const activePromise = new Promise((resolve) => {
            resolvePromise = resolve;
        });
        const tx = { transaction_id: 'TX-CONCURRENT' };
        // Register lock
        workflowEngineSingleton.registerInFlightLock(workflowId, 'TX-CONCURRENT', activePromise);
        // Incoming second request with same key
        const partition = workflowEngineSingleton.partitionIncomingTransactions(workflowId, [tx], 'transaction_id');
        expect(partition.inFlight.length).toBe(1);
        expect(partition.toExecute.length).toBe(0);
        // Resolve promise
        resolvePromise({ transaction_id: 'TX-CONCURRENT', _validation_status: 'PASS' });
        await activePromise;
    });
});
