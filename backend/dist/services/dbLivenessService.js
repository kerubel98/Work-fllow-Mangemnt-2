/**
 * Database Liveness Probing & Adaptive Circuit Breaker Service
 * Prevents cascaded failures, socket starvation, and false-negative transaction flags
 * by verifying external database health before batch queries are dispatched.
 */
import { testExternalDbConnection } from './dbConnectionManager.js';
import { eventService } from './events.js';
const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 30000; // 30s cooldown before attempting HALF_OPEN test
class DatabaseLivenessService {
    circuits = new Map();
    /**
     * Retrieves or initializes the circuit breaker state for a database.
     */
    getStatus(dbId, dbName = 'Unknown DB') {
        let status = this.circuits.get(dbId);
        if (!status) {
            status = {
                dbId,
                dbName,
                state: 'CLOSED',
                failureCount: 0
            };
            this.circuits.set(dbId, status);
        }
        return status;
    }
    /**
     * Fast pre-flight health probe against an external database.
     */
    async probeLiveness(db, timeoutMs = 4000) {
        const status = this.getStatus(db.id, db.name);
        const now = Date.now();
        // If circuit is OPEN, check if cooldown has elapsed to enter HALF_OPEN
        if (status.state === 'OPEN') {
            if (status.lastFailureTime && now - status.lastFailureTime > COOLDOWN_MS) {
                status.state = 'HALF_OPEN';
                console.warn(`[CircuitBreaker] DB ${db.name} (${db.id}) transitioning from OPEN to HALF_OPEN (probing recovery).`);
            }
            else {
                return {
                    isAlive: false,
                    latencyMs: 0,
                    error: `Circuit breaker is OPEN for database '${db.name}'. Cooldown active (${Math.round((COOLDOWN_MS - (now - (status.lastFailureTime || now))) / 1000)}s remaining).`
                };
            }
        }
        const start = Date.now();
        try {
            // Execute fast ping with a hard timeout
            const probePromise = testExternalDbConnection(db);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`Liveness probe timed out after ${timeoutMs}ms`)), timeoutMs));
            const result = await Promise.race([probePromise, timeoutPromise]);
            const latencyMs = Date.now() - start;
            if (result.success) {
                this.recordSuccess(db.id, latencyMs);
                return { isAlive: true, latencyMs };
            }
            else {
                this.recordFailure(db.id, db.name, result.message || 'Health probe failed');
                return { isAlive: false, latencyMs, error: result.message };
            }
        }
        catch (err) {
            const latencyMs = Date.now() - start;
            const errMsg = err?.message || 'Connection handshake failed';
            this.recordFailure(db.id, db.name, errMsg);
            return { isAlive: false, latencyMs, error: errMsg };
        }
    }
    /**
     * Records a successful probe or query execution, closing the circuit.
     */
    recordSuccess(dbId, latencyMs) {
        const status = this.getStatus(dbId);
        if (status.state !== 'CLOSED') {
            console.log(`[CircuitBreaker] DB ${status.dbName} (${dbId}) recovered. Circuit is now CLOSED.`);
            eventService.broadcastEvent('db:circuit_recovered', { dbId, dbName: status.dbName });
        }
        status.state = 'CLOSED';
        status.failureCount = 0;
        status.lastSuccessTime = Date.now();
        status.lastLatencyMs = latencyMs;
        status.error = undefined;
    }
    /**
     * Records a probe or query failure, advancing the circuit towards OPEN.
     */
    recordFailure(dbId, dbName, error) {
        const status = this.getStatus(dbId, dbName);
        status.failureCount++;
        status.lastFailureTime = Date.now();
        status.error = error;
        if (status.state === 'HALF_OPEN' || status.failureCount >= FAILURE_THRESHOLD) {
            status.state = 'OPEN';
            console.error(`[CircuitBreaker] DB ${dbName} (${dbId}) reached ${status.failureCount} failures. Circuit is now OPEN.`);
            eventService.broadcastEvent('db:circuit_tripped', {
                dbId,
                dbName,
                failureCount: status.failureCount,
                error
            });
        }
    }
    /**
     * Quick check if queries are currently permitted to the target database.
     */
    canExecute(dbId) {
        const status = this.circuits.get(dbId);
        if (!status)
            return true;
        if (status.state === 'CLOSED')
            return true;
        if (status.state === 'HALF_OPEN')
            return true;
        if (status.state === 'OPEN') {
            // Check if cooldown elapsed
            if (status.lastFailureTime && Date.now() - status.lastFailureTime > COOLDOWN_MS) {
                status.state = 'HALF_OPEN';
                return true;
            }
            return false;
        }
        return true;
    }
}
export const dbLivenessService = new DatabaseLivenessService();
