# Code & Architectural Audit Report: External DB Connectivity, Live Query Engine, AI & Analytics

**Audit ID**: `AUD-EXTDB-AI-METRICS-2026-11-25`  
**Date**: 2026-11-25  
**Auditor**: Antigravity Autonomous Code Audit Engine  
**Governing Skill**: [`.agents/skills/code-audit/SKILL.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/code-audit/SKILL.md)  
**Governing Invariants & Principles**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rule 4: External System Agnosticism, Rule 11: Query Bounds & ANSI Quoting, Rule 19: Team-Scoped DB Connection Isolation & Credential Protection)  
**Target Scope**: External Database Connection Manager (`dbConnectionManager.ts`), Liveness Circuit Breaker (`dbLivenessService.ts`), External Query Builder (`externalDataQueryService.ts`), AI SQL/Discrepancy Routes (`ai.ts`), and Managerial Metrics (`metrics.ts`, `analyticsService.ts`)  
**Branch / Commit**: `feature/frontend-redesign` (`d7bf228`)  
**Status**: `RESOLVED` (See [`SIGN-OFF-EXTDB-AI-METRICS-2026-11-26.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/sign-off/SIGN-OFF-EXTDB-AI-METRICS-2026-11-26.md))  

---

## 1. Executive Summary

A scoped code and security audit was performed on the **External DB Connectivity, Live Query Engine, AI & Analytics** subsystem. This layer manages connection pooling to external MySQL, PostgreSQL, and MongoDB ledgers, adaptive circuit breaking (`dbLivenessService`), parameterized tuple query construction (`externalDataQueryService`), Gemini AI SQL/discrepancy assistance (`ai.ts`), and live operational KPIs (`analyticsService.ts`).

The audit verified strong engineering in `dbLivenessService` (3-failure threshold, 30s `HALF_OPEN` recovery, hard timeouts) and `externalDataQueryService` (ANSI identifier quoting and twin-row preservation). However, **4 actionable findings** (**1 CRITICAL**, **1 HIGH**, **2 MEDIUM**) were uncovered, led by a critical fast-path bypass in `executeLiveQueryOnDb` that allows `UNION` or stacked-query access to internal `operational_workflow_db` tables.

| Severity | Count | Summary of Key Vulnerabilities / Risks |
| :--- | :---: | :--- |
| **CRITICAL** | 1 | `mirror_*` fast-path in `dbConnectionManager.ts:456-471` executes raw `SELECT` queries directly on the primary internal PostgreSQL pool, enabling `UNION`/stacked-query exfiltration of `users`, `database_connections`, and `provider_connections`. |
| **HIGH** | 1 | `POST /api/ai/analyze-discrepancy` (`ai.ts:48-66`) transmits unredacted `transactionData` (potential PII/PAN) to external Google Gemini APIs. |
| **MEDIUM** | 2 | `GET /api/metrics/team/:teamId` lacks team membership authorization; external DB pool caches lack background TTL eviction and TLS/SSL configuration. |
| **LOW** | 0 | None identified in this scope. |

---

## 2. Files & Modules Examined

- [`backend/src/services/dbConnectionManager.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/dbConnectionManager.ts): Connection string resolution, external MySQL/PG pooling, catalog introspection, and `executeLiveQueryOnDb`.
- [`backend/src/services/dbLivenessService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/dbLivenessService.ts): Pre-flight health probing and `CLOSED`/`OPEN`/`HALF_OPEN` circuit breaker state machine.
- [`backend/src/services/externalDataQueryService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/externalDataQueryService.ts): Parameterized tuple SQL builder (`buildQueryFromExtraction`).
- [`backend/src/routes/ai.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/ai.ts): Gemini AI SQL generation and discrepancy root-cause analysis.
- [`backend/src/routes/metrics.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/metrics.ts) & [`backend/src/services/analyticsService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/analyticsService.ts): Operational overview and team KPI aggregations.

---

## 3. Findings Summary Table

| Finding ID | Severity | Category | Location | Summary | Status |
| :--- | :---: | :--- | :--- | :--- | :--- |
| `AUD-EXT-001` | **CRITICAL** | Security & Isolation | `backend/src/services/dbConnectionManager.ts:456-471` | `mirror_*` fast-path allows `UNION` / stacked-query exfiltration of internal `operational_workflow_db` tables. | `RESOLVED` |
| `AUD-EXT-002` | **HIGH** | Privacy & Compliance | `backend/src/routes/ai.ts:48-66` | Unredacted financial `transactionData` sent to external Google Gemini API. | `RESOLVED` |
| `AUD-EXT-003` | **MEDIUM** | Authorization | `backend/src/routes/metrics.ts:22-29` | `GET /api/metrics/team/:teamId` exposes team KPIs without checking team membership. | `RESOLVED` |
| `AUD-EXT-004` | **MEDIUM** | Resource & Transport | `backend/src/services/dbConnectionManager.ts:376-417` | External DB pool caches lack periodic TTL sweep, omit credential hash in key, and omit TLS/SSL options. | `RESOLVED` |

---

## 4. Detailed Findings

### AUD-EXT-001: `mirror_*` Fast-Path Allows `UNION` / Stacked-Query Exfiltration of Internal PostgreSQL Tables
- **Severity**: CRITICAL
- **Status**: RESOLVED (See [`SIGN-OFF-EXTDB-AI-METRICS-2026-11-26.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/sign-off/SIGN-OFF-EXTDB-AI-METRICS-2026-11-26.md))
- **Location**: [`backend/src/services/dbConnectionManager.ts#L456-L471`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/dbConnectionManager.ts#L456-L471)
- **Evidence**:
  ```typescript
  const tableMatch = trimmed.match(/\bFROM\s+[`"']?([a-zA-Z0-9_.-]+)[`"']?/i);
  const targetTable = tableMatch ? (tableMatch[1].split('.').pop() || tableMatch[1]) : trimmed;

  if (targetTable.startsWith('mirror_')) {
    if (!/^[a-zA-Z0-9_]+$/.test(targetTable)) ...
    if (!/^\s*SELECT\b/i.test(trimmed)) ...
    const res = params && params.length > 0 ? await queryPg(trimmed, params) : await queryPg(trimmed);
  ```
- **Description**: Any query beginning with `SELECT` whose first `FROM` clause references a `mirror_*` identifier is routed directly to the primary internal PostgreSQL pool (`operational_workflow_db`). Because semicolons, `UNION`, `JOIN`, and subqueries are not blocked, a caller can execute `SELECT * FROM mirror_x UNION ALL SELECT id, username, password_hash, ... FROM users` or `SELECT * FROM mirror_x; DELETE FROM issues;`, bypassing external DB isolation and reading/mutating core system tables.
- **Recommended Remediation**:
  1. Reject semicolons (`;`), `UNION`, `INTO`, and references to any non-`mirror_*` table in the fast-path.
  2. Enforce team ownership on `mirror_*` tables before executing queries.

### AUD-EXT-002: Unredacted Financial Transaction PII Sent to External AI API
- **Severity**: HIGH
- **Status**: RESOLVED (See [`SIGN-OFF-EXTDB-AI-METRICS-2026-11-26.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/sign-off/SIGN-OFF-EXTDB-AI-METRICS-2026-11-26.md))
- **Location**: [`backend/src/routes/ai.ts#L48-L66`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/ai.ts#L48-L66)
- **Evidence**: `POST /api/ai/analyze-discrepancy` passes `JSON.stringify(transactionData)` directly to `ai.models.generateContent(...)`.
- **Recommended Remediation**: Mask/redact sensitive fields (`card_number`, `pan`, `account_number`, `customer_name`, `email`, `phone`) before dispatching payloads to external LLM endpoints.

### AUD-EXT-003: Cross-Team KPI Exposure on `GET /api/metrics/team/:teamId`
- **Severity**: MEDIUM
- **Status**: RESOLVED (See [`SIGN-OFF-EXTDB-AI-METRICS-2026-11-26.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/sign-off/SIGN-OFF-EXTDB-AI-METRICS-2026-11-26.md))
- **Location**: [`backend/src/routes/metrics.ts#L22-L29`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/metrics.ts#L22-L29)
- **Evidence**: Endpoint queries `analyticsService.getTeamKpis(teamId)` without checking if `req.user` belongs to `teamId` or is an admin.
- **Recommended Remediation**: Verify `req.user.role === 'admin'` or team membership before returning team KPIs.

### AUD-EXT-004: Unbounded External Pool Cache & Missing TLS/SSL Options
- **Severity**: MEDIUM
- **Status**: RESOLVED (See [`SIGN-OFF-EXTDB-AI-METRICS-2026-11-26.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/sign-off/SIGN-OFF-EXTDB-AI-METRICS-2026-11-26.md))
- **Location**: [`backend/src/services/dbConnectionManager.ts#L376-L417`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/dbConnectionManager.ts#L376-L417)
- **Evidence**: `pgPoolCache` and `mysqlPoolCache` never run `evictExternalDbPool()` on a periodic timer, cache keys omit username/password hashes, and TLS/SSL configuration is not passed to external `pg.Pool` / `mysql.createPool` constructors.
- **Recommended Remediation**: Schedule periodic idle pool eviction, include credential hash in cache keys, and support configurable `ssl` options on external connections.

---

## 5. Positive Observations
- **`dbLivenessService.ts`**: Implements a clean `CLOSED` → `OPEN` → `HALF_OPEN` circuit breaker with hard 4,000ms timeouts and SSE recovery broadcasts.
- **`externalDataQueryService.ts`**: Properly quotes identifiers per dialect and preserves twin-row records by avoiding premature business-key deduplication.
- **`analyticsService.ts`**: Computes genuine PostgreSQL aggregations (`FILTER (WHERE ...)` and `date_trunc`) with zero mock metric fallbacks when connected.

---

## 6. References
- [Master Audit Register](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/master-audit.md)
- [Audit Reports Index](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/INDEX.md)
