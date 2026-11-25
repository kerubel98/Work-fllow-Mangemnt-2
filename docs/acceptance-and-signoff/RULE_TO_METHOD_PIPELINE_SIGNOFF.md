# Rule-to-Method Pipeline Architecture — Audit Sign-Off Document

**Document**: `RULE_TO_METHOD_PIPELINE_SIGNOFF.md`  
**Date**: October 10, 2026  
**Auditor**: AI-assisted static code verification  
**Scope**: Backend pipeline engine, SQL compiler, reconciliation services, external data acquisition  
**Sign-off status**: **NOT APPROVED — REMEDIATION REQUIRED**

---

## 1. Sign-Off Verdict

| Category | Status |
|----------|--------|
| Architecture design intent | APPROVED — separation of verdict/action is structurally sound |
| Implementation correctness | REJECTED — multiple critical defects confirmed |
| SQL security | REJECTED — fail-open paths and unsafe predicate handling |
| Transaction identity integrity | REJECTED — row-number-only scoping, missing task isolation |
| Outcome completeness | REJECTED — later stages overwrite earlier outcomes |
| Error handling | REJECTED — silent catches, false success counts |
| Production readiness | **NOT APPROVED** |

---

## 2. Verification Method

Each finding traced to physical source code. Classifications: **CONFIRMED**, **PARTIALLY CONFIRMED**, **MITIGATED**, **NOT CONFIRMED**.

---

## 3. Confirmed Critical Findings

### 3.1 AUD-001 — Fail-Open SQL Compilation [PARTIALLY CONFIRMED]

**File**: `backend/src/services/ruleSqlCompiler.ts`

- Line 102: `let baseSql = 'TRUE';` — permissive default
- Line 169: AMOUNT_MATCH with no compareValue defaults to `> 0`
- Line 251: DATABASE_CONFIG_RULES/COLUMN_CONFIG → `baseSql = 'TRUE'`
- Line 256: Default case with hasColumnConfigs → `baseSql = 'TRUE'`

**Mitigation**: Line 258 throws for unsupported check types. Line 137 throws when targetCol missing (not TRUE as originally claimed).

---

### 3.2 AUD-002 — Unsafe SQL Predicate Sanitizer [CONFIRMED]

**File**: `backend/src/services/ruleSqlCompiler.ts`

- Lines 36-45: Keyword blacklisting — not a reliable security boundary
- No AST parsing; values interpolated as string literals
- Line 119: NUMERIC_TOLERANCE margin interpolated directly

**Mitigations**: Lines 203-204 operator allowlist; lines 227-229 finite number validation.

---

### 3.3 AUD-003 — Unrestricted External Queries [NOT CONFIRMED]

**File**: `backend/src/services/externalDataQueryService.ts`

No `whereClause = '1=1'` exists. Code throws errors when extraction keys missing (fail-closed).

---

### 3.4 AUD-005 — Persistence Overwrites Configured Actions [CONFIRMED]

**File**: `backend/src/services/reconciliationService.ts`

- Lines 154-155: `DEFAULT_PIPELINE_ACTIONS.ON_PASS/ON_FAIL` fallback
- Lines 174-175: Actions interpolated as string literals without enum validation

---

### 3.5 AUD-008 — Later Stages Overwrite Earlier Outcomes [CONFIRMED]

**File**: `backend/src/services/pipeline/ExecutablePipeline.ts`

- Line 309: `rowHistoryMap = new Map<number, Array<{...}>>()` — keyed only by rowNumber
- `recordStageOutcome` helper pushes to arrays (append-only within batch)

**Impact**: Row-number-only keying risks cross-batch collision.

---

### 3.6 AUD-010 — Errors Swallowed [CONFIRMED]

- `ExecutablePipeline.ts` line 433: `} catch { /* non-fatal */ }`
- `CoordinateInjector.ts` line 200: `return []` on error
- `ReconciliationEngine.ts` line 358: `console.warn(...)` — no re-throw

---

### 3.7 AUD-011 — Incorrect Persistence Counts [PARTIALLY CONFIRMED]

**File**: `backend/src/services/reconciliationService.ts`

- Line 33: Returns `0` when DB disconnected (not `records.length` as originally claimed)
- Counts calculated from unique rowOutcomes (not double-counted)

---

### 3.8 AUD-012 — Cardinality SQL Lacks Rule-Block Scope [CONFIRMED]

**File**: `backend/src/services/ruleSqlCompiler.ts`

- Line 435: Cardinality count missing `_rule_block_id`

---

### 3.9 EP-001 — Fallback to Unrelated Compiled Rule [CONFIRMED]

**File**: `backend/src/services/pipeline/ExecutablePipeline.ts`

- Line 98: `|| this.compiledRules[0]` fallback
- Line 99: `if (!rule) continue;`

---

### 3.10 EP-008 — Row-Number-Only Outcome Map [CONFIRMED]

**File**: `backend/src/services/pipeline/ExecutablePipeline.ts`

- Line 309: Keyed only by `rowNumber`

---

### 3.11 PB-005 — Mutable Compiled Plan [CONFIRMED]

**File**: `backend/src/services/pipeline/WorkflowPipelineBuilder.ts`

No `Object.freeze()` or immutable patterns.

---

### 3.12 PB-006 — Empty Workflow Fallback [CONFIRMED]

**File**: `backend/src/services/pipeline/WorkflowPipelineBuilder.ts`

Lines 62-71: synthetic default stage when all stages disabled.

---

### 3.13 RS-003 — Nondeterministic Duplicate Selection [CONFIRMED]

**File**: `backend/src/services/reconciliationService.ts`

Lines 159-163: `DISTINCT ON (row_number)` with `ORDER BY row_number` only.

---

### 3.14 RS-009 — Composite-Key Collisions [CONFIRMED]

**File**: `backend/src/services/reconciliationService.ts`

Line 115: `::` delimiter — values containing `::` can collide.

---

## 4. Mitigated Findings

| ID | Finding | Mitigation |
|----|---------|------------|
| RE-001 | Unknown check types | Fails closed (lines 261-263) |
| RE-002 | Unknown cardinality policies | Returns CARDINALITY_BREACH (line 70) |
| RE-003 | EXPLICIT_FIRST status | Uses ORDERED_FIRST_PICKED (line 62) |
| SC-005 | Undefined alias `t` | Conditional FROM clause (lines 464-496) |
| PB-002 | Single-stage cycle | `fromStage !== toStage` check (line 262) |
| PB-003 | Disconnected ordering | queue.sort by stage.order (lines 278-282) |
| PB-004 | Target validation | _validateStageConfig (lines 349-357) |
| AUD-003 | Unrestricted queries | Code throws instead of `1=1` |
| EP-006 | Non-FAIL treated as PASS | Returns strictly `'PASS' \| 'FAIL'` (line 104) |

---

## 5. Not Confirmed

| ID | Finding | Actual Behavior |
|----|---------|-----------------|
| RE-006 | OR condition passes when disagree | Logic correct — both must match (lines 247-249) |
| AUD-003 | `1=1` fallback | Does not exist — throws error instead |
| RS-001 | Returns records.length | Returns `0` when DB disconnected |
| AUD-011 | Double-counting | Counts from unique rowOutcomes |

---

## 6. Partially Confirmed

| ID | Finding | Notes |
|----|---------|-------|
| AUD-001 | Fail-Open | Line 137 throws (not TRUE); lines 169/251/256 still permissive |
| AUD-004 | Single-row vs batch | AMOUNT_MATCH diverges |
| AUD-006 | Missing matches | Synthesized in executeBatch but not reconcileSet |
| AUD-007 | Transaction identity | Mirror queries lack _task_id |
| AUD-009 | Cardinality | RE-004 confirmed; RE-011 confirmed |
| SC-003 | NUMERIC_THRESHOLD | Has allowlist; NUMERIC_TOLERANCE doesn't |

---

## 7. Additional Confirmed Findings

| ID | Finding | File | Evidence |
|----|---------|------|----------|
| RE-004 | Multi-row uses only first | ReconciliationEngine.ts | Line 203: `rows[0]` |
| RE-005 | Amount parsing hides invalid data | ReconciliationEngine.ts | Lines 211-212: parseFloat without NaN check |
| RE-007 | Missing rows not synthesized | ReconciliationEngine.ts | reconcileSet() |
| RE-008 | Exceptions logged/ignored | ReconciliationEngine.ts | Line 358 |
| RE-009 | Counts mix rows/transactions | ReconciliationEngine.ts | Lines 363-374 |
| RE-010 | Action metrics incomplete | ReconciliationEngine.ts | Lines 368-369 |
| CI-001 | Errors become empty arrays | CoordinateInjector.ts | Line 200 |
| CI-002 | Missing task scope | CoordinateInjector.ts | Lines 189-190 |
| CI-003 | Incomplete coordinate validation | CoordinateInjector.ts | Lines 89-95 |
| CI-004 | Broad error-message interpretation | CoordinateInjector.ts | Lines 124-125 |
| CI-005 | Partial chunk writes | CoordinateInjector.ts | No transaction wrapping |
| CI-006 | Unvalidated returned row numbers | CoordinateInjector.ts | Line 138 |
| CI-007 | Column-name normalization collisions | CoordinateInjector.ts | Line 183 |
| RS-005 | Incomplete update scope | reconciliationService.ts | Lines 198-199 |
| RS-011 | Partial chunk persistence | reconciliationService.ts | Lines 39-68 |

---

## 8. Remediation Priority

### Phase 1 — Critical Security (Immediate)
1. Close fail-open SQL for AMOUNT_MATCH/COLUMN_CONFIG (AUD-001)
2. Replace keyword-blacklist sanitizer (AUD-002)
3. Validate and parameterize SQL values (AUD-002, AUD-005)

### Phase 2 — Outcome Integrity (Very High)
4. Use composite keys for outcome maps (EP-008)
5. Eliminate empty catches (AUD-010)
6. Reject missing method-to-rule mappings (EP-001)
7. Add _rule_block_id to cardinality SQL (AUD-012)

### Phase 3 — Identity & Isolation (Very High)
8. Add _task_id to mirror queries (CI-002)
9. Validate row number uniqueness (CI-003)
10. Make compiled plans immutable (PB-005)
11. Reject all-disabled workflows (PB-006)

### Phase 4 — Metrics & Persistence (High)
12. Implement recoverable chunk persistence (RS-011, CI-005)
13. Fix nondeterministic DISTINCT ON (RS-003)
14. Fix composite-key collisions (RS-009)

---

## 9. Sign-Off Conditions

- [ ] All Phase 1 critical security findings resolved
- [ ] All Phase 2 outcome integrity findings resolved
- [ ] Regression tests pass
- [ ] Single-row and batch execution produce equivalent results
- [ ] Every input transaction receives exactly one authoritative outcome
- [ ] SQL injection attempts rejected or safely parameterized
- [ ] No silent catches remain in execution path
- [ ] Compiled plans immutable after creation

---

## 10. Document References

- [RULE_TO_METHOD_PIPELINE_AUDIT.md](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/RULE_TO_METHOD_PIPELINE_AUDIT.md)
- [RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md)
- [MASTER_ARCHITECTURE_INDEX.md](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md)
