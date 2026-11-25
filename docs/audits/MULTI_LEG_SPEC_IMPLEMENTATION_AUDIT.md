# Multi-Leg Duplicate Detection & JSONB Coordinate Specification — Implementation Audit Report

**Document**: `MULTI_LEG_SPEC_IMPLEMENTATION_AUDIT.md`  
**Date**: October 10, 2026  
**Specification**: `MULTI_LEG_DUPLICATE_DETECTION_AND_JSONB_COORDINATE_SPECIFICATION.md` (616 lines)  
**Audit type**: Static code verification against physical implementation  
**Overall assessment**: **PARTIALLY IMPLEMENTED** — 14 of 16 claims implemented, 2 partial, 0 contradicted

---

## 1. Executive Summary

The Multi-Leg Duplicate Detection specification describes a two-level reconciliation architecture that separates external data discovery (`reconciliation_status`) from business rule evaluation (`validation_status`). The codebase implements the majority of this specification with high fidelity.

**Key finding**: The two-level status architecture is **not cleanly separated at the persistence layer**. The `reconciliation_status` field is set from the aggregated mirror validation status rather than purely from record presence, conflating Level 1 and Level 2 as the specification explicitly warns against.

---

## 2. Verification Results

| # | Claim | Classification | Evidence |
|---|-------|---------------|----------|
| 1 | §1.2 Pt 1: Set-based reconciliation with (task_id, row_number) join | **IMPLEMENTED** | `reconciliationService.ts` lines 304-345 |
| 2 | §1.2 Pt 2: returned_data JSONB column for multi-leg aggregation | **IMPLEMENTED** | Migration `027_task_dataset_transactions_returned_data.sql` |
| 3 | §1.2 Pt 3: Two-Level Status Architecture | **PARTIAL** | `reconciliationService.ts` lines 331-342 — see finding 3.1 |
| 4 | §1.2 Pt 4: DbConfigMethod as pipeline method | **IMPLEMENTED** | `DbConfigValidationMethod.ts` line 33 |
| 5 | §1.2 Pt 5: targetTable → DbConfigMethod[] mapping | **IMPLEMENTED** | `WorkflowPipelineBuilder.ts` lines 161-203 |
| 6 | §1.2 Pt 6: Downstream validators consume from returned_data | **IMPLEMENTED** | `DbConfigValidationMethod.ts` lines 79-83 |
| 7 | §1.2 Pt 7: Default reconciliator is presence-only | **PARTIAL** | `ReconciliationEngine.ts` lines 207-209 — see finding 3.2 |
| 8 | §3.1: returned_data column in schema | **IMPLEMENTED** | Migration 027 |
| 9 | §3.1: GIN index on returned_data | **IMPLEMENTED** | Migration 027 lines 6-7 |
| 10 | §3.2: database_column_configurations structure | **IMPLEMENTED** | `types.ts` lines 1699-1731 |
| 11 | §4.1: Set-based mirror aggregation | **IMPLEMENTED** | `reconciliationService.ts` lines 304-345 |
| 12 | §4.2: DbConfigMethod execution flow | **IMPLEMENTED** | `DbConfigValidationMethod.ts` lines 100-252 |
| 13 | §4.3: Status mutation governance | **IMPLEMENTED** | `ExecutablePipeline.ts` lines 132-179 |
| 14 | §4.4: Data keys recording | **IMPLEMENTED** | `DbConfigValidationMethod.ts` line 111 |
| 15 | §5: UI investigation report integration | **IMPLEMENTED** | `ValidationOrchestratorWorkspace.tsx` lines 2588-2658 |
| 16 | §7.3.1: 64-bit advisory locking | **PARTIAL** | `investigationOrchestratorService.ts` line 1273 — see finding 3.3 |

---

## 3. Detailed Findings

### 3.1 Two-Level Status Conflation [MEDIUM]

**Specification claim** (§1.2 Point 3, lines 32-35):
> `reconciliation_status` is "Purely reflects external data discovery" with a strict "Presence Rule" (≥1 record → PASS; 0 → FAIL).

**Actual implementation** (`reconciliationService.ts` lines 331-342):
```sql
canonical_data = (tdt.canonical_data - 'auditTrail' - 'stageResults') || jsonb_build_object(
  '_validation_status', gm._validation_status,
  'reconciliation_status', gm._validation_status,  -- SAME VALUE
  ...
)
```

Both `reconciliation_status` and `_validation_status` receive the same aggregated mirror validation status (`bool_or(_validation_status = 'FAIL')`). A failing business rule (e.g., AMOUNT_MATCH) flips `reconciliation_status` to FAIL even when records were found.

**Impact**: The two levels are not cleanly separated at the persistence layer. The specification's core architectural principle is violated.

**Required fix**: Set `reconciliation_status` based purely on record presence (`COUNT(*) > 0`), independent of validation rule outcomes.

---

### 3.2 Default Reconciliator Presence-Only [LOW]

**Specification claim** (§1.2 Point 7, line 51):
> The Default Reconciliator is Strictly a Presence Check

**Actual implementation**: `EXISTENCE_CHECK` is presence-only (`passed = rows.length > 0`), but the `reconciliation_status` field is set from aggregated validation status (see 3.1). The presence-only guarantee is undermined by the persistence layer conflation.

---

### 3.3 Advisory Locking Mechanism [MEDIUM]

**Specification claim** (§7.3.1, lines 540-553):
> Mandates `pg_try_advisory_xact_lock` (non-blocking, transaction-scoped, returns boolean) with HTTP 409 Conflict on lock failure.

**Actual implementation** (`investigationOrchestratorService.ts` line 1273):
```sql
SELECT pg_advisory_lock(('x' || substr(md5('task_exec_' || $1), 1, 16))::bit(64)::bigint)
```

Uses blocking `pg_advisory_lock` (session-level, waits indefinitely) instead of non-blocking `pg_try_advisory_xact_lock`. Concurrent executions queue rather than receive immediate rejection.

**64-bit key derivation**: Correctly implemented per Rule 10.

---

### 3.4 Migration Reference [LOW]

**Specification implies**: `returned_data` column added in `001_initial_schema.sql`

**Actual**: Column added in migration `027_task_dataset_transactions_returned_data.sql`. The `001_initial_schema.sql` defines the base table without `returned_data`.

---

### 3.5 Method Naming Divergence [LOW]

**Specification roadmap** references:
- `canonical_data._target_records: [...]`
- `evaluateMultiLegDuplicateCheck`

**Actual implementation** uses:
- `returned_data` column (not `_target_records`)
- `evaluateConfig` method (not `evaluateMultiLegDuplicateCheck`)

Architecture matches; naming differs.

---

## 4. What Is Correctly Implemented

### 4.1 Set-Based Mirror Aggregation
`reconciliationService.ts` lines 304-345: Uses `WITH grouped_mirror AS (... GROUP BY _task_id, _row_number)` with `jsonb_agg()` to aggregate all mirror legs per coordinate, then atomically updates `task_dataset_transactions` via set-based `UPDATE ... FROM`.

### 4.2 returned_data JSONB Column
Migration 027 adds `returned_data JSONB` with GIN index. The column stores multi-leg arrays namespaced by `[workflowId][targetTable]`.

### 4.3 DbConfigMethod Pipeline Integration
`DbConfigValidationMethod` implements `ValidationMethod` interface. `WorkflowPipelineBuilder` creates instances from `database_column_configurations`. `ExecutablePipeline` executes them LAST in stage, only on passed rows.

### 4.4 Status Mutation Governance
MUTATE_STATUS flips validation to FAIL on breach. REPORT_ONLY records diagnostic details without changing PASS status. Both single-row and batch paths implement this correctly.

### 4.5 Downstream Data Sourcing
`DbConfigValidationMethod` and `ReconciliationMethod` both consume from `returned_data` in `task_dataset_transactions`, not from transient mirror tables.

### 4.6 UI Integration
`ValidationOrchestratorWorkspace.tsx` displays two-level status badges (`R:{reconStatus}`), multi-leg count badges, and expandable leg accordion inspector.

### 4.7 Anti-Subquery Protection
`WorkflowPipelineBuilder` lines 205-215: When `dbConfigMethods` are attached, `columnConfigurations` are stripped from `compiledRules` passed to the mirror UPDATE, preventing correlated subqueries.

### 4.8 Test Coverage
`twoLevelReconciliationAndMultiLeg.test.ts` (193 lines) provides physical verification for multi-leg duplicate detection, REPORT_ONLY mode, and conditional filtering.

---

## 5. Remediation Priority

| Priority | Finding | Required Fix |
|----------|---------|--------------|
| Medium | §3.1 Two-Level Status Conflation | Set `reconciliation_status` from presence only (`COUNT(*) > 0`), not from validation status |
| Medium | §3.3 Advisory Locking | Replace `pg_advisory_lock` with `pg_try_advisory_xact_lock` + HTTP 409 on failure |
| Low | §3.4 Migration Reference | Update spec to reference migration 027 |
| Low | §3.5 Method Naming | Align spec roadmap with actual method names |

---

## 6. Document References

- [MULTI_LEG_DUPLICATE_DETECTION_AND_JSONB_COORDINATE_SPECIFICATION.md](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MULTI_LEG_DUPLICATE_DETECTION_AND_JSONB_COORDINATE_SPECIFICATION.md)
- [RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md)
- [RULE_TO_METHOD_PIPELINE_SIGNOFF.md](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/RULE_TO_METHOD_PIPELINE_SIGNOFF.md)
- [MASTER_ARCHITECTURE_INDEX.md](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md)
