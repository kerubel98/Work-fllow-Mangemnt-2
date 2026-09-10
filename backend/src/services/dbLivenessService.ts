/**
 * Database Liveness Probing & Adaptive Circuit Breaker Service
 * Prevents cascaded failures, socket starvation, and false-negative transaction flags
 * by verifying external database health before batch queries are dispatched.
 */

import { DatabaseConnection } from '../types.js';
import { testExternalDbConnection } from './dbConnectionManager.js';
import { eventService } from './events.js';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerStatus {
  dbId: string;
  dbName: string;
  state: CircuitBreakerState;
  failureCount: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  lastLatencyMs?: number;
  error?: string;
}

export interface LivenessProbeResult {
  isAlive: boolean;
  latencyMs: number;
  error?: string;
}

const FAILURE_THRESHOLD = 3;
const COOLDOWN_MS = 30000; // 30s cooldown before attempting HALF_OPEN test

class DatabaseLivenessService {
  private circuits = new Map<string, CircuitBreakerStatus>();

  /**
   * Retrieves or initializes the circuit breaker state for a database.
   */
  public getStatus(dbId: string, dbName = 'Unknown DB'): CircuitBreakerStatus {
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
  public async probeLiveness(db: DatabaseConnection, timeoutMs = 4000): Promise<LivenessProbeResult> {
    const status = this.getStatus(db.id, db.name);
    const now = Date.now();

    // If circuit is OPEN, check if cooldown has elapsed to enter HALF_OPEN
    if (status.state === 'OPEN') {
      if (status.lastFailureTime && now - status.lastFailureTime > COOLDOWN_MS) {
        status.state = 'HALF_OPEN';
        console.warn(`[CircuitBreaker] DB ${db.name} (${db.id}) transitioning from OPEN to HALF_OPEN (probing recovery).`);
      } else {
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
      const timeoutPromise = new Promise<{ success: boolean; message: string }>((_, reject) =>
        setTimeout(() => reject(new Error(`Liveness probe timed out after ${timeoutMs}ms`)), timeoutMs)
      );

      const result = await Promise.race([probePromise, timeoutPromise]);
      const latencyMs = Date.now() - start;

      if (result.success) {
        this.recordSuccess(db.id, latencyMs);
        return { isAlive: true, latencyMs };
      } else {
        this.recordFailure(db.id, db.name, result.message || 'Health probe failed');
        return { isAlive: false, latencyMs, error: result.message };
      }
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      const errMsg = err?.message || 'Connection handshake failed';
      this.recordFailure(db.id, db.name, errMsg);
      return { isAlive: false, latencyMs, error: errMsg };
    }
  }

  /**
   * Records a successful probe or query execution, closing the circuit.
   */
  public recordSuccess(dbId: string, latencyMs?: number): void {
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
  public recordFailure(dbId: string, dbName: string, error: string): void {
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
  public canExecute(dbId: string): boolean {
    const status = this.circuits.get(dbId);
    if (!status) return true;
    if (status.state === 'CLOSED') return true;
    if (status.state === 'HALF_OPEN') return true;
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
