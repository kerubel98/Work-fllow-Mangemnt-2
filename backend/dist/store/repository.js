/**
 * repository.ts — Unified PostgreSQL Repository Delegate
 *
 * This file is the single export point for all data access across the application.
 * PostgreSQL is the sole persistence layer (operational_workflow_db).
 *
 * All MongoDB and in-memory fallback branches have been removed:
 *   - MongoDB was never configured (no MONGODB_URI in .env)
 *   - In-memory store was dev scaffolding only
 *   - postgresRepo.ts is the authoritative implementation
 *
 * If PostgreSQL goes offline, individual postgresRepo methods will throw
 * and be caught by the Express route error handlers (returning HTTP 500).
 */
import { postgresRepo } from './postgresRepo.js';
export const repo = postgresRepo;
