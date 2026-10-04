# Operational Pipeline Engine: Master Architectural Specification & Blueprint

**Compiled Date:** 2026-10-02  
**Source Discussion:** Operational Governance Modernization, Multi-Stage Pipelines, Execution-Context Lineage, Decoupled Output Contracts, and Next-Stage Input Resolution.  
**Repository Path:** `c:/Users/hp/Downloads/opration-workflow-mangement1`  
**Governing Documents:** [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md), [`SKILL.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/bo-operational-governance/SKILL.md), [`CURRENT_PROJECT_CONTEXT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/CURRENT_PROJECT_CONTEXT.md), [`DECISION_LOG.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/DECISION_LOG.md)

---

## Architectural Classification Taxonomy

To uphold **Rule 1** (*Repository Reality Trumps Assumptions*) and **Rule 20** (*Evidence-Based Persistent-State Modification*), all architectural specifications, data models, and service interfaces in this document are explicitly annotated with one of three status tags:

- **`[CURRENT]`**: Existing, physically verified repository implementation. These components are already deployed in PostgreSQL (`operational_workflow_db`), the Express backend, or the React frontend.
- **`[TARGET]`**: Approved architectural evolution scheduled for direct implementation. These components resolve established shortcomings (e.g. rigid PASS/FAIL data routing, ambiguous cardinality, unconstrained fallbacks).
- **`[PROPOSED]`**: Candidate design or conceptual optimization under active review, requiring empirical validation before freezing into code.

---

## 1. Executive Summary

This master blueprint establishes the comprehensive architectural contract for the Back-Office (BO) Reconciliation, Validation, and Investigation Pipeline. The platform moves beyond ad-hoc workflow interpretation into a **hardened, compiled, execution-context-aware pipeline engine**.

```text
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                      THE FIVE ARCHITECTURAL PILLARS                         │
 ├─────────────────────────────────────────────────────────────────────────────┤
 │ 1. Four Governance Layers & Zero Data Loss [CURRENT]                         │
 │    Mandatory dry-run sequence, PostgreSQL authority, and team DB scoping.   │
 │                                                                             │
 │ 2. Strict Two-Tier Typings [CURRENT]                                        │
 │    ValidationBoxType (containers) vs CheckType (arithmetic rules).          │
 │                                                                             │
 │ 3. Decoupled Output Contracts & Next-Stage Input Resolver [TARGET]          │
 │    Verdict ≠ Action ≠ Data Source. Upstream contract dictates consumption.  │
 │                                                                             │
 │ 4. Execution-Context Lineage Hierarchy [TARGET]                             │
 │    Eliminates bare task_id joins. Strict Task -> Run -> Stage -> Row scope. │
 │                                                                             │
 │ 5. Fail-Safe Integrity & Controlled Configuration Errors [TARGET]           │
 │    Explicit cardinality policies, validated semantic bridges, no guessing. │
 └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Part I: The Four Governance Layers & Repository Invariants `[CURRENT]`

The architecture is anchored across four synchronized, non-negotiable governance layers:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Layer 1: AGENTS.md [CURRENT]                                           │
│ Rules 17–20: 8-Step Dry-Run Sequence, Zero Blanket Deletions,         │
│ Canonical ValidationBoxType Enums, Team DB Scoping, Evidence-Based Mod.│
├────────────────────────────────────────────────────────────────────────┤
│ Layer 2: bo-operational-governance/SKILL.md [CURRENT]                  │
│ Operational Procedures: §3.19 (Dry-Run), §3.20 (Cross-Layer Matrix),   │
│ §3.21 (Team Isolation), §5 (6-Phase Workflow), §6 (18 Anti-Patterns).  │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 3: CURRENT_PROJECT_CONTEXT.md [CURRENT]                          │
│ Baseline State: Section 31 documenting migration 012, canonical enums, │
│ and the 3 Incident Post-Mortems (Cleanup, Enums, Team DB Isolation).   │
├────────────────────────────────────────────────────────────────────────┤
│ Layer 4: DECISION_LOG.md [CURRENT]                                     │
│ Architectural Decision Records (ADR-001 through ADR-005).              │
└────────────────────────────────────────────────────────────────────────┘
```

### Core Repository Invariants:
1. **Mandatory 8-Step Dry-Run Sequence (`AGENTS.md` Rule 17):**
   ```text
   IDENTIFY → SELECT → VERIFY → DRY RUN → REPORT → OBTAIN APPROVAL → MODIFY/DELETE → VERIFY
   ```
2. **Zero Blanket Deletes:** `DELETE FROM <persistent_table>` or `DROP TABLE` without restrictive identifier scoping (e.g. `WHERE id = ANY($1)` or `is_system_mock = true`) is strictly forbidden across all persistent entities.
3. **Single Datastore Authority:** PostgreSQL (`operational_workflow_db`) is the active primary operational database across 27 relational tables. External targets (MySQL, Oracle, MongoDB, MSSQL) are integrated via typed `UNLOGGED` mirror tables (`mirror_{db}_{table}`).
4. **Four-Eyes Principle (`AGENTS.md` Rule 7):** Manual transaction overrides (`FORCE_MATCH`, `WRITE_OFF`, `MANUAL_REVERSAL`) require Maker proposal and Checker approval with `makerId !== checkerId`.

---

## 3. Part II: Two-Tier Typings & Canonical Separations `[CURRENT]`

### 3.1 Container Type vs. Rule Check Type
- **Tier 1 — Container / Workflow Node Type (`ValidationBoxType`):**  
  Restricted strictly to the four canonical categories defined in [`frontend/src/types.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/types.ts#L1253) and [`backend/src/types.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/types.ts#L1126):  
  `'INGESTION_SEARCH' | 'CONDITION_CHECK' | 'RECONCILIATION' | 'REPORT'`.  
  *Governs UI canvas nodes, drawer wizards, tab filtering, and pipeline sequencing.*
- **Tier 2 — Internal Check Algorithm (`CheckType`):**  
  Resides strictly inside `rule_definition.checkType` or `steps[].checkType`:  
  `'EXISTENCE_CHECK' | 'AMOUNT_MATCH' | 'VALUE_MATCH' | 'ISO_DECLINE_CODE'`.  
  *Never store a CheckType string inside `validation_boxes.box_type` or PostgreSQL column `box_type`.*

### 3.2 Reconciliation Box vs. Reconciliation Method
- **Reconciliation Box (`ValidationBoxType = 'RECONCILIATION'`):** A visual building block configured by the operator to perform multi-source cross-system matching.
- **Reconciliation Method (Internal Engine Worker):** The universal evaluation routine executed inside **every stage** (including `INGESTION_SEARCH`) that matches input keys against mirror rows, evaluates bound database column configurations, stamps status vectors, and packages the stage output contract.

### 3.3 `INGESTION_SEARCH` as a True Reconciler
`INGESTION_SEARCH` is not a dumb SELECT query; it is a full reconciliation operation:
1. **Key Matching:** Correlates incoming transaction keys (e.g. `REFNUM`) against the external database target table (`auth_log_tab.refnum`).
2. **Existence Reconciliation:** Emits `PASS` (Record Found) or `FAIL` (Missing Ingress).
3. **Data Hydration:** Pulls external database columns (`auth_id`, `card_no`, `respcode`, `auth_amount`) into the mirror table to feed downstream stages.

---

## 4. Part III: Decoupled Output Contracts & Next-Stage Input Resolver `[TARGET]`

### 4.1 The Architectural Flaw of Rigid PASS/FAIL Data Routing
Previous drafts coupled the data source directly to the boolean verdict:
```text
[RIGID ANTI-PATTERN]
PASS Branch ──► Reads from Mirror 1
FAIL Branch ──► Reads from Raw Input Fallback
```
**Why this breaks in financial operations:**
In back-office transaction processing, **Validation Verdict ≠ Pipeline Action**. A validation can result in `FAIL + CONTINUE`.
- *Example:* Stage 1 searches the authorization database. The record exists, but an amount variance check fails.
  - `Validation Result`: `FAIL` (Amount mismatch: $100.00 vs $105.00).
  - `Pipeline Action`: `CONTINUE` (Proceed downstream to identify settlement and fees).
  - `Stage 1 Output`: The external authorization row was retrieved and populated `auth_id = "AUTH_9921"`.
- If a rigid engine forces Stage 2 to read from raw task input on `FAIL`, Stage 2 **loses the newly discovered `auth_id`**, making it impossible to query downstream settlement databases that require `auth_id`!

### 4.2 The Four-Pillar Decoupled Execution Model
The pipeline engine strictly decouples four distinct dimensions:

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 1. VALIDATION RESULT                                                   │
│    PASS | FAIL | ERROR                                                 │
│    What did the business rule discover about the transaction?          │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ 2. INFRASTRUCTURE & EXECUTION CONDITION                                │
│    HEALTHY | DB_OFFLINE | TIMEOUT | CONFIGURATION_ERROR                │
│    What was the physical operating environment condition?             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ 3. PIPELINE ACTION                                                     │
│    CONTINUE | CLOSE | STOP                                             │
│    What should the orchestration engine do next?                       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ 4. STAGE OUTPUT CONTRACT                                               │
│    StageExecutionSummary (Batch/Stage level statistics)                │
│    StageRowExecutionResult[] (Per-row output, keys & lineage vector)   │
│    What usable data did this stage produce?                            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
                        NEXT-STAGE INPUT RESOLVER
           (Resolves input by required key capabilities, not blind distance)
                                    │
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
    Mirror Output           Predecessor Output          Task Dataset
   (Discovered Keys)         (Prior Leg Context)       (Ingress Invariant)
                                    │
                                    ▼
                         Stage N+1 Input Dataset
```

### 4.3 Output Contract Specification: Summary vs. Row Results `[TARGET]`
A stage execution processes a batch of transaction rows. Individual rows may pass, fail, or encounter data variances independently. Therefore, the output contract is partitioned into **Stage-Level Summary** and **Row-Level Execution Results**:

```typescript
// 1. Stage-Level Execution Summary
export interface StageExecutionSummary {
  stageId: string;
  stageExecutionId: string;
  workflowExecutionId: string;
  infrastructureCondition: 'HEALTHY' | 'DB_OFFLINE' | 'TIMEOUT' | 'CONFIGURATION_ERROR';
  totalRows: number;
  passedCount: number;
  failedCount: number;
  errorCount: number;
  durationMs: number;
  outputTarget: {
    type: 'MIRROR_TABLE' | 'VIRTUAL_DATASET' | 'PASSTHROUGH';
    tableName: string; // e.g. mirror_core_auth_log_tab
    schema: Record<string, string>; // column -> data_type
  };
  producedKeyNames: string[]; // e.g. ['refnum', 'auth_id', 'card_no', 'respcode']
}

// 2. Row-Level Execution Result
export interface StageRowExecutionResult {
  rowNumber: number;
  transactionId: string; // UUID or business key
  validationResult: 'PASS' | 'FAIL' | 'ERROR';
  pipelineAction: 'CONTINUE' | 'CLOSE' | 'STOP';
  inputQuality: 'VERIFIED_CLEAN' | 'UPSTREAM_FAILED_BUT_HYDRATED' | 'SYNTHETIC_FALLBACK';
  matchFound: boolean;
  producedValues: Record<string, any>; // Discovered attributes (e.g. { auth_id: 'A_992' })
  errorDetail?: string;
  lineage: RowExecutionLineage;
}

// 3. Consolidated Output Contract
export interface StageOutputContract {
  summary: StageExecutionSummary;
  rows: StageRowExecutionResult[];
}
```

### 4.4 Responsibilities of the Next-Stage Input Resolver `[TARGET]`
The `NextStageInputResolver` is an I/O mapping adapter, **NOT** an orchestration controller. It does not decide validation rules or business policy. It answers one deterministic capability question:

> *"Given the next stage's required input keys, which valid upstream output provides those keys, and how are they mapped?"*

Its responsibilities are:
1. **Target Key Inspection:** What input keys does Stage $N+1$ require (e.g., `auth_id`)?
2. **Capability Matching:** Which upstream stage in the active execution lineage produced that specific key capability?
3. **Data Usability:** Even if Stage $N$ validation produced `FAIL` (e.g., amount variance), was external data fetched and usable (`pipelineAction === 'CONTINUE'`)?
4. **Key Availability vs. Blind Ancestor Jumping:** If Stage $N$ failed to produce `auth_id` (404 Not Found), the resolver checks if an earlier stage or the task ingress dataset contains an alternative compatible key explicitly declared by Stage $N+1$. If no upstream output provides the required keys, it halts with `CONFIGURATION_ERROR` (no blind guessing).
5. **Input Quality Tagging:** Tags resolved data as `VERIFIED_CLEAN` vs. `UPSTREAM_FAILED_BUT_HYDRATED` so downstream stages know the pedigree of their inputs.

---

## 5. Part IV: Execution-Context Lineage Grounded in Repository Reality `[CURRENT]` / `[TARGET]`

### 5.1 Why `task_id` Must NOT Be the Downstream Join Mechanism
Treating `WHERE task_id = ?` as the sole join criteria is a critical failure mode:
- A single business task/case (`task_id`) undergoes:
  - Multiple workflow executions (re-runs, manual triggers).
  - Retries of failed batches.
  - Multi-stage DAG pipelines with parallel branches.
  - Re-ingested files and multi-version workflow runs.
- Querying `SELECT * FROM mirror_table WHERE task_id = ?` results in **cross-execution data corruption**, joining rows from previous failed runs or alternate branches into the current execution!

### 5.2 The Genuine Repository Execution Hierarchy
The execution hierarchy maps to existing, verified repository datastore structures (`001_initial_schema.sql` and `mirrorTableManager.ts`):

```text
Level 1: Task / Case (`issues.id` VARCHAR)
  │      Business investigation container
  │
  └── Level 2: Execution Batch / Job (`_batch_id` VARCHAR)
        │      Transient operational batch execution identifier
        │
        └── Level 3: Workflow Stage (`stages[].id` VARCHAR)
              │      Specific node in the compiled workflow DAG
              │
              └── Level 4: Dataset Row (`task_dataset_transactions.row_number` INT)
                    │      Deterministic row index within the ingested dataset
                    │
                    └── Level 5: Transaction Entity (`task_dataset_transactions.id` UUID / `_mirror_id` UUID)
                           Authoritative surrogate key of the specific transaction
```

### 5.3 Physical Mirror Table Scoping
Mirror tables generated by [`mirrorTableManager.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/mirrorTableManager.ts#L125-L131) physically contain:
`_mirror_id UUID`, `_batch_id VARCHAR(64)`, `_rule_block_id VARCHAR(64)`, `_validation_status VARCHAR(32)`, `_validation_action VARCHAR(32)`, `_validation_details JSONB`, `_mirrored_at TIMESTAMPTZ`.

Set-based joins and query scoping must strictly leverage `(_batch_id, _rule_block_id)`—the physical columns already indexed in PostgreSQL—rather than unverified invented columns.

---

## 6. Part V: Granular Data Quality Tracking vs. Blunt Taint `[TARGET]`

### 6.1 Complete Elimination of `isDiagnosticOnly`
Previous drafts stamped `isDiagnosticOnly: true` on any record that traversed a `FAIL` branch. This is discarded.
In financial reconciliation, an unauthorized settlement found in a clearing ledger after an authorization lookup fails is **vital audit evidence of an orphan settlement**. Tainting downstream records as "diagnostic only" risks having compliance pipelines silently ignore real financial breaks.

### 6.2 The Granular Lineage & Data Quality Vector `[TARGET]`
Records carry a clean `RowExecutionLineage` vector without boolean diagnostic flags:

```typescript
export interface RowExecutionLineage {
  taskId: string;
  batchId: string;
  rowNumber: number;
  stagesTraversed: Array<{
    stageId: string;
    stageExecutionId: string;
    validationResult: 'PASS' | 'FAIL' | 'ERROR';
    infrastructureCondition: 'HEALTHY' | 'DB_OFFLINE' | 'TIMEOUT' | 'CONFIGURATION_ERROR';
    pipelineAction: 'CONTINUE' | 'CLOSE' | 'STOP';
    matchFound: boolean;
    discrepancyReasons?: string[];
    dataSourceUsed: 'MIRROR_TABLE' | 'UPSTREAM_PREDECESSOR' | 'RAW_TASK_INPUT';
    inputQuality: 'VERIFIED_CLEAN' | 'UPSTREAM_FAILED_BUT_HYDRATED' | 'SYNTHETIC_FALLBACK';
  }>;
  currentInputQuality: 'VERIFIED_CLEAN' | 'UPSTREAM_FAILED_BUT_HYDRATED' | 'SYNTHETIC_FALLBACK';
}
```

### 6.3 Downstream Consumption Rules:
1. **Mathematical Isolation:** Downstream stages performing automated balance adjustments or fee calculations must bypass mutating arithmetic if `currentInputQuality === 'UPSTREAM_FAILED_BUT_HYDRATED'`.
2. **Forensic Observation Allowed:** Downstream stages performing search, verification, and audit lookups execute normally and record evidence.
3. **Lineage-Aware Discrepancy Classification:** The final report aggregator evaluates `currentInputQuality`, `matchFound`, and stage history to classify breaks accurately (e.g. distinguishing `ORPHAN_SETTLEMENT` from `SETTLEMENT_AMOUNT_MISMATCH`).

---

## 7. Part VI: Decoupled Multi-Row Cardinality Policies & Aggregation Strategies `[TARGET]`

### 7.1 The Danger of Universal `LATEST` Defaults
In banking reconciliation, external database queries frequently return multiple rows for a single reference number:
- Duplicate authorizations.
- Pre-authorization followed by completion.
- Partial reversals and fee re-presentments.
If an engine builder injects `multiRowPolicy: 'LATEST'` by default without operator awareness, it **silently discards transaction legs**, leading to undetected financial discrepancies.

### 7.2 Independent Decoupling: Cardinality vs. Aggregation `[TARGET]`
Previous drafts conflated multi-row cardinality resolution with mathematical aggregation (e.g. creating an ad-hoc hybrid enum `SUM_AND_COLLAPSE`). In enterprise back-office architectures, **Cardinality** (how many records exist / how multiple matches are routed) is orthogonal to **Aggregation** (how attribute or numeric values are summarized).

The engine builder decouples them into two distinct, independently configurable models:

```typescript
// Cardinality Policy: Dictates row multiplicity and routing behavior
export type MultiRowCardinalityPolicy =
  | 'STRICT_SINGLE'           // Asserts exactly 1 matching row. >1 rows raises AMBIGUOUS_CARDINALITY_ERROR unless aggregated
  | 'ONE_TO_MANY'             // Preserves all returned rows, fanning out downstream checks across all legs
  | 'EXPLICIT_LATEST'         // Selects newest row; REQUIRES explicit orderByColumn (e.g. auth_timestamp DESC)
  | 'EXPLICIT_FIRST'          // Selects oldest row; REQUIRES explicit orderByColumn (e.g. created_at ASC)
  | 'ALL_ROWS'                // Preserves raw returned row set without fanout (passed as array/composite)
  | 'REQUIRE_MANUAL_SELECTION'; // Flags ambiguous rows for Maker-Checker human review

// Aggregation Strategy: Dictates mathematical and attribute rollup behavior
export type AggregationStrategy =
  | 'NONE'                    // No aggregation performed (rows remain discrete)
  | 'SUM'                     // Sums designated numeric amount columns (e.g. multi-leg settlement amounts)
  | 'COUNT'                   // Counts matching occurrences
  | 'MIN'                     // Selects minimum value
  | 'MAX'                     // Selects maximum value
  | 'CUSTOM';                 // Custom aggregation rule defined in box configuration
```

### 7.3 Proportional Enforcement & Compiler Invariant
1. **No Silent Defaults:** Every stage and validation box must explicitly declare its `cardinalityPolicy`. If omitted, the `ValidationPipelineBuilder` **rejects the workflow at compilation time** with:
   ```text
   COMPILATION_ERROR: Stage [stage-2-fees] does not define an explicit cardinalityPolicy. 
   Silent resolution defaults are forbidden by Operational Governance.
   ```
2. **Mandatory Ordering Columns:** If `EXPLICIT_LATEST` or `EXPLICIT_FIRST` is specified, an `orderByColumn` (e.g. `auth_timestamp`, `created_at`) is mandatory. Compilation fails if the ordering column is missing.
3. **Multi-Leg Settlement Handling:** When multi-leg settlements occur, configuring `cardinalityPolicy: 'ONE_TO_MANY'` together with `aggregationStrategy: 'SUM'` enables the engine to aggregate multiple settlement records into a consolidated balance check against the primary authorization without dropping individual audit records.

---

## 8. Part VII: Semantically Constrained Schema Bridging & Controlled Errors `[TARGET]`

### 8.1 The "Zero Crashes" Fallback Fallacy
In financial infrastructure, a "zero crash" guarantee achieved via silent fallback or unverified field guessing is a dangerous anti-pattern. If two databases cannot be reliably joined, guessing or falling back to unverified fields produces **erroneous reconciliations and phantom matches**.  
The correct enterprise behavior is **Fail-Fast with a Controlled `CONFIGURATION_ERROR`**.

### 8.2 The 3-Tier Precedence Hierarchy
Schema bridging resolves join keys between upstream stages and downstream queries strictly through three verifiable tiers:

```text
               Connecting Stage N Output ──► Stage N+1 Input
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ TIER 1: Explicit DB Table Relationship Config [CURRENT]                      │
│ • Check db_table_relationship_configs for Table N -> Table N+1 mapping.      │
│   ──► VERIFIED: Use explicit join columns (e.g. auth_code -> auth_code)       │
└───────────────────────────────────────┬───────────────────────────────────────┘
                                        │ UNCONFIGURED
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ TIER 2: Constrained Semantic Translation via Canonical Directory [TARGET]    │
│ • Both columns map to the same Global Standard Directory key                 │
│   (global_standard_directory and database_table_mappings).                    │
│ • Strict Semantic Guardrails (MUST ALL PASS):                                 │
│   1. Data types match or are safe to cast (e.g. VARCHAR(32) == VARCHAR(64)). │
│   2. Normalization rule defined (e.g. UPPER + TRIM).                         │
│   3. Mapping status is active/approved in database_table_mappings.           │
│   ──► VERIFIED: Bridge via verified canonical mapping.                       │
└───────────────────────────────────────┬───────────────────────────────────────┘
                                        │ UNCONFIGURED OR AMBIGUOUS
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ TIER 3: Explicit Box-Level Input Parameter Mapping [CURRENT]                 │
│ • Box explicitly declares inputField -> targetColumn binding.                 │
│   ──► VERIFIED: Use box-configured key binding.                               │
└───────────────────────────────────────┬───────────────────────────────────────┘
                                        │ UNCONFIGURED
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ CONTROLLED CONFIGURATION ERROR [TARGET]                                       │
│ • Stage execution halts immediately.                                          │
│ • Status: PAUSED_CONFIGURATION_ERROR.                                         │
│ • Lineage recorded: "Cannot resolve bridge keys between Stage N and Stage N+1"│
│ • Zero unverified guesses. No silent data pollution.                         │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Part VIII: The True Gang of Four Builder Pattern & Plan-Driven Execution `[TARGET]`

### 9.1 Gang of Four Builder Pattern Architecture
The Builder Pattern is not a static validation helper called inside an ignored `try/catch` block. It cleanly separates the construction of a complex validation plan from its execution, adhering to classical Gang of Four Builder principles:

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│ 1. THE BUILDER (ValidationPipelineBuilder)                                    │
│    • Fluent assembly API: .addStage(), .withCardinality(), .withAggregation() │
│    • Workflow model compiler: compile(workflow: DatabaseValidationWorkflow)   │
│    • Validates DAG acyclicity via Kahn's algorithm (topological sorting)      │
│    • Pre-indexes table relationships and field mappings                        │
│    • Validates explicit cardinality policies and required ordering columns    │
│    • Validates and scopes attachedDbConfigIds against PostgreSQL repo         │
│    • Fail-Fast: Throws on any cycle, missing cardinality, or ambiguous join   │
└───────────────────────────────────────┬────────────────────────────────────────┘
                                        │ produces (immutable)
                                        ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ 2. THE PRODUCT (CompiledValidationPlan)                                        │
│    • workflowId: string, version: string, compiledAt: string                   │
│    • isAcyclic: true, topologicalOrder: string[]                              │
│    • stages: CompiledStagePlan[] (immutable, topologically sorted)             │
│      ├── stageId, stageName, order, targetDbId, targetTable                    │
│      ├── cardinalityPolicy: MultiRowCardinalityPolicy                          │
│      ├── aggregationStrategy: AggregationStrategy                             │
│      ├── attachedDbConfigIds: string[]                                         │
│      ├── requiredInputKeys: string[]                                           │
│      └── steps: ValidationCheckStep[]                                          │
└───────────────────────────────────────┬────────────────────────────────────────┘
                                        │ consumed exclusively by
                                        ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│ 3. THE DIRECTOR / EXECUTOR (InvestigationOrchestratorService)                 │
│    • DOES NOT inspect raw workflow.steps or raw workflow.stages ad-hoc         │
│    • Compiles plan once: const plan = validationPipelineBuilder.compile(wf)   │
│    • If compilation throws, execution NEVER starts (PAUSED_CONFIGURATION_ERROR)│
│    • Iterates STRICTLY AND EXCLUSIVELY over plan.stages                        │
│    • Executes stage I/O, reconciliation, and output contract construction      │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Elimination of the Toothless Validation Anti-Pattern
Previous iterations in the orchestrator executed code such as:
```typescript
// ANTI-PATTERN: Toothless try/catch validation
try {
  validationPipelineBuilder.compile(workflow);
} catch (compileErr) {
  console.warn(`DAG pre-flight validation notice: ${compileErr.message}`);
}
// Orchestrator then ignored the compiled plan and looped over raw workflow.stages!
```
**This anti-pattern is prohibited.**  
Under the true Builder Pattern:
1. `ValidationPipelineBuilder.compile(workflow)` is a mandatory gate.
2. If compilation fails, the error halts execution immediately and updates the task status to `PAUSED_CONFIGURATION_ERROR`.
3. The orchestrator iterates strictly over `plan.stages`. Every stage executes with pre-validated cardinality policies, pre-indexed join keys, and bound configuration IDs.

### 9.3 Fluent Builder Construction API
In addition to declarative workflow JSON compilation, the builder exposes a fluent construction interface for programmatic and unit-test pipeline assembly:

```typescript
export class PipelineBuilder {
  private stages: StageBuilder[] = [];
  private workflowMetadata: { id: string; name: string; version: string };

  public static create(id: string, name: string): PipelineBuilder { ... }
  public addStage(stageId: string, name: string): StageBuilder { ... }
  public build(): CompiledValidationPlan { ... }
}

export class StageBuilder {
  public withTarget(dbId: string, table: string): this { ... }
  public withCardinality(policy: MultiRowCardinalityPolicy, orderBy?: string): this { ... }
  public withAggregation(strategy: AggregationStrategy): this { ... }
  public bindDatabaseConfigurations(configIds: string[]): this { ... }
  public requireInputKeys(keys: string[]): this { ... }
  public addStep(step: ValidationCheckStep): this { ... }
  public done(): PipelineBuilder { ... }
}
```

### 9.4 Where DB Configurations Execute: Stage Reconciliation Method
External column configurations (`database_column_configurations` `[CURRENT]`) must execute inside the **Stage's Reconciliation Method**, NOT inside the Validation Box I/O method:

```text
Validation Box Method (I/O & Mirror Worker)
  │
  ├─► 1. Prepares Batched ANSI-quoted SQL (Parameters <= 30,000)
  ├─► 2. Queries External Database (with connection health timeout)
  └─► 3. Bulk inserts results into UNLOGGED Mirror Table (mirror_{db}_{table})
  ▼
Stage Reconciliation Method (Evaluation & Routing Engine)
  │
  ├─► Step A: Key Matching (Input vs Mirror) via Composite Execution Keys
  ├─► Step B: Execute BOUND DB Column Configs (attachedDbConfigIds)
  │           • Regex patterns, decline code lookups, completeness, ranges
  ├─► Step C: Compute Atomic Stage Verdict (PASS / FAIL / ERROR)
  ├─► Step D: Determine Pipeline Action (CONTINUE / FLAG / STOP / CLOSE)
  ├─► Step E: Package StageOutputContract (Summary + Row-Level Results)
  └─► Step F: Invoke NextStageInputResolver for Downstream Stages
```

---

## 10. Part IX: Anti-Contamination via Explicit Workflow Binding `[CURRENT]` / `[TARGET]`

### 10.1 The Contamination Threat
If the engine dynamically loads all column configurations defined for a table globally, an experimental or draft rule added by Operator A on `auth_log_tab` will silently execute inside and break production workflows managed by Operator B.

### 10.2 Architectural Mandate: Explicit Binding
**Auto-loading all table configs globally is strictly prohibited.**  
Each workflow stage must explicitly declare its trusted array of bound configuration IDs:

```json
{
  "stageId": "stage-1-auth-ingress",
  "name": "Auth Ingress & Parameter Verification",
  "targetTable": "auth_log_tab",
  "cardinalityPolicy": "STRICT_SINGLE",
  "aggregationStrategy": "NONE",
  "attachedDbConfigIds": [
    "colcfg-auth-respcode-00",
    "colcfg-terminal-id-not-null",
    "colcfg-amount-positive"
  ]
}
```

- **Draft Isolation:** New configurations remain completely inactive until explicitly attached to a workflow stage.
- **Scope Verification:** At compile time, `ValidationPipelineBuilder` queries `postgresRepo.ts` to verify that every ID in `attachedDbConfigIds` exists, is active, and is accessible within the current team's scope or global scope (`team_id IS NULL`).
- **Audit Immutability:** When a workflow is approved under Four-Eyes governance (`workflow_bundles` `[CURRENT]`), the bundle freezes the exact configuration IDs and versions, preventing runtime tampering.

---

## 11. Part X: Master Execution Architecture & Discrepancy Aggregator `[TARGET]`

### 11.1 The Golden Architectural Anchor Sentence
> **"A stage's Validation Result determines what the stage concluded; its Pipeline Action determines how execution proceeds; its Stage Output Contract determines what data it makes available; and the Next-Stage Input Resolver determines what the next stage may consume. No single status, task_id, mirror table, or PASS/FAIL branch is sufficient to define downstream lineage."**

### 11.2 Real Database Schema Lineage
Lineage mapping adheres strictly to the physical PostgreSQL schema defined in `backend/src/database/migrations/001_initial_schema.sql` and `mirrorTableManager.ts`:
- **Mirror Tables (`mirror_{db}_{table}`):** Physical columns are `_mirror_id UUID`, `_batch_id VARCHAR(64)`, `_rule_block_id VARCHAR(64)`, `_validation_status VARCHAR(32)`, `_validation_action VARCHAR(32)`, `_validation_details JSONB`, `_mirrored_at TIMESTAMPTZ`.
- **Task Dataset Transactions (`task_dataset_transactions`):** Physical columns are `task_id UUID`, `row_number INTEGER`, `data JSONB`.
- **Execution Scoping:** Stage runs use `_batch_id` as the execution batch identifier and `_rule_block_id` as the stage identifier. Joins between task dataset records and mirror records join strictly on `(task_dataset_transactions.row_number = mirror_table._validation_details->>'taskRowNumber')` or surrogate reference keys, never on fabricated physical columns.

### 11.3 Master Execution Diagram

```text
                              [ Workflow JSON ]
                                      │
                                      ▼
                        ValidationPipelineBuilder [TARGET]
                        ├── Acyclic DAG Verification (Kahn's Algorithm)
                        ├── Pre-Indexes DB Relationships (Tier 1-3)
                        ├── Validates Explicit Cardinality & Aggregation
                        └── Validates & Scopes attachedDbConfigIds
                                      │
                                      ▼
                         Compiled Validation Plan [TARGET]
                                      │
    ┌─────────────────────────────────┴─────────────────────────────────┐
    │                                                                   │
    ▼                                                                   ▼
[ Task Dataset Ingress ]                                     [ Execution Context Created ]
• task_id: "TASK_001"                                        • batch_id: "batch_exec_992"
• Original file records                                      • 64-bit Advisory Lock Acquired
    │                                                                   │
    └─────────────────────────────────┬─────────────────────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ STAGE 1: INGESTION_SEARCH (Auth Database)                                     │
│                                                                               │
│ 1. Validation Box I/O Worker:                                                  │
│    • Queries auth_log_tab WHERE refnum IN (...) [Param bound < 30,000]        │
│    • Inserts fetched rows into mirror_core_auth_log_tab                       │
│      (storing _batch_id = 'batch_exec_992', _rule_block_id = 'stage_01')      │
│                                                                               │
│ 2. Stage Reconciliation Method:                                               │
│    • Joins Input vs Mirror on row_number / reference keys                     │
│    • Evaluates attachedDbConfigIds (respcode == '00', amount > 0)             │
│    • Enforces CardinalityPolicy: STRICT_SINGLE, AggregationStrategy: NONE     │
│                                                                               │
│ 3. Produces Stage 1 Output Contract:                                          │
│    • Summary: totalRows, passedRows, failedRows, mirrorTable                  │
│    • Row Results: rowNumber, matchFound, validationResult, pipelineAction     │
│    • Result: PASS (Found & Valid) OR FAIL (Amount Mismatch)                   │
│    • Action: CONTINUE                                                         │
│    • Produced Keys: ['refnum', 'auth_id', 'card_no', 'auth_amount']           │
└───────────────────────────────────────┬───────────────────────────────────────┘
                                        │
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ NEXT-STAGE INPUT RESOLVER [TARGET]                                            │
│                                                                               │
│ Resolves Input for Stage 2 (Settlement Verification):                         │
│ • Does Stage 2 require auth_id? ──► YES.                                      │
│ • Did Stage 1 output contract produce auth_id? ──► YES.                       │
│ • Usable even if Stage 1 Result was FAIL? ──► YES (Action was CONTINUE).     │
│ • Selected Source: mirror_core_auth_log_tab (Scoped to _batch_id, stage_01)    │
│ • Injected Input Quality:                                                     │
│   - If Stage 1 PASS ──► VERIFIED_CLEAN                                        │
│   - If Stage 1 FAIL ──► UPSTREAM_FAILED_BUT_HYDRATED (Lineage preserved)      │
└───────────────────────────────────────┬───────────────────────────────────────┘
                                        │
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ STAGE 2: CONDITION_CHECK / RECONCILIATION (Settlement Database)               │
│                                                                               │
│ 1. Validation Box I/O Worker:                                                  │
│    • Queries sv_fin_tab WHERE auth_code IN (...)                              │
│    • Inserts fetched rows into mirror_settlement_tab                          │
│                                                                               │
│ 2. Stage Reconciliation Method:                                               │
│    • Joins Stage 1 output vs Stage 2 mirror                                   │
│    • Evaluates attachedDbConfigIds                                            │
│    • Appends to RowExecutionLineage vector                                    │
│                                                                               │
│ 3. Produces Stage 2 Output Contract:                                          │
│    • Result: PASS / FAIL                                                      │
│    • Action: CONTINUE / CLOSE                                                 │
└───────────────────────────────────────┬───────────────────────────────────────┘
                                        │
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ LINEAGE-AWARE DISCREPANCY AGGREGATOR (statusAggregator.ts [TARGET])           │
│                                                                               │
│ Evaluates Both PASS and FAIL Reports Across All Stages:                       │
│                                                                               │
│ Case 1: Stage 1 PASS + Stage 2 PASS                                           │
│         ──► Rollup: PASS | Status: VERIFIED_MATCH                             │
│                                                                               │
│ Case 2: Stage 1 PASS + Stage 2 FAIL                                           │
│         ──► Rollup: FAIL | Status: FLAGGED_DISCREPANCY                        │
│         ──► Business Classification: ⚠️ UNSETTLED_AUTHORIZATION               │
│                                                                               │
│ Case 3: Stage 1 FAIL (Missing Auth) + Stage 2 PASS (Found in Settlement)      │
│         ──► Rollup: PARTIAL_MATCH | Status: FLAGGED_DISCREPANCY               │
│         ──► Business Classification: ⚠️ ORPHAN_SETTLEMENT                     │
│                                                                               │
│ Case 4: Stage 1 PASS + Stage 2 PASS (Amount Variance)                         │
│         ──► Rollup: FAIL | Status: FLAGGED_DISCREPANCY                        │
│         ──► Business Classification: ⚠️ SETTLEMENT_AMOUNT_MISMATCH            │
│                                                                               │
│ Outputs Immutable Four-Eyes Evidence Snapshot for Checker Review              │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## 12. Part XI: Master 8-Milestone Implementation Sequence

The implementation is structured into 8 discrete milestones (Milestones 0 through 7). Each milestone requires completing and recording a **10-Point Evidence Artifact** before implementation proceeds:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       MASTER 8-MILESTONE SEQUENCE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│ Milestone 0: Discovery & Ground Truth Audit                                 │
│              • Inspect physical DB tables, existing repo structures         │
│              • Verify zero speculative creation                             │
│                                                                             │
│ Milestone 1: Core Type Contracts & Four-Pillar Decoupling                   │
│              • Decouple Result, Condition, Action, OutputContract           │
│              • Partition StageOutputContract (Summary + RowResults)         │
│              • Decouple CardinalityPolicy vs. AggregationStrategy           │
│                                                                             │
│ Milestone 2: The True Builder Pattern & Plan Compilation                    │
│              • ValidationPipelineBuilder fluent construction API            │
│              • Topological DAG compilation & fail-fast validation           │
│                                                                             │
│ Milestone 3: NextStageInputResolver with Real Schema Lineage                │
│              • Key-driven resolution, ancestor fallback, quality tracking   │
│                                                                             │
│ Milestone 4: Plan-Driven Investigation Orchestrator Engine                  │
│              • Executes strictly against compiledPlan.stages                │
│              • Elimination of toothless try/catch validation                │
│                                                                             │
│ Milestone 5: Explicit DB Configuration Scoping & Binding                   │
│              • attachedDbConfigIds validation & stage execution             │
│                                                                             │
│ Milestone 6: Lineage-Aware Discrepancy Aggregator                           │
│              • Multi-stage report aggregation for PASS and FAIL             │
│              • Classify ORPHAN_SETTLEMENT, UNSETTLED_AUTH, AMOUNT_MISMATCH  │
│                                                                             │
│ Milestone 7: Studio & Workflow Inspector DB Config Binding UI               │
│              • WorkflowStudioFlowchart & WorkflowInspector interactive UI   │
│              • Cardinality, aggregation, and attachedDbConfigIds controls   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The Mandatory 10-Point Evidence Artifact Template
For every milestone, the following artifact must be evaluated and recorded:
1. **Milestone Identifier & Title**
2. **Repository Baseline Verification** (active git commit and file paths checked)
3. **Database Schema Reality** (physical tables and columns verified via migrations)
4. **Governing Architecture Section** (explicit cross-link to this master architecture)
5. **Decoupling Invariant Check** (ensuring Verdict, Condition, Action, OutputContract remain separated)
6. **No-Fabrication Verification** (verifying no unmigrated physical columns are assumed)
7. **Fail-Fast Error Verification** (verifying that invalid configurations halt with `CONFIGURATION_ERROR`)
8. **Test Coverage Specification** (unit, regression, and failure cases)
9. **Dry-Run & Impact Assessment** (verifying existing features remain unaffected)
10. **Checker Review Checklist** (Four-Eyes review criteria)

---

## 13. Appendix: Governance Cross-Reference Table

| Architectural Principle | Governing Rule | Specification Section |
| :--- | :--- | :--- |
| Single Datastore Authority (PostgreSQL) | `AGENTS.md` Rule 1 | Section 2 |
| Validation Result ≠ Pipeline Action | `AGENTS.md` Rule 2 | Section 4.1 |
| Canonical ValidationBoxType Segregation | `AGENTS.md` Rule 18 | Section 3.1 |
| Team Database Connection Isolation | `AGENTS.md` Rule 19 | Section 2 |
| Evidence-Based State & Classification | `AGENTS.md` Rule 20 | Section "Architectural Taxonomy" |
| 64-Bit Cryptographic Advisory Locking | `AGENTS.md` Rule 10 | Section 11.3 |
| Composite SQL Bounds (< 30,000 params) | `AGENTS.md` Rule 11 | Section 9.4 |
| Maker-Checker Four-Eyes Principle | `AGENTS.md` Rule 7 | Section 2 & Section 11.3 |
| Controlled Configuration Errors (No Guesses) | `DECISION_LOG.md` ADR-002 | Section 8.1 & Section 8.2 |
| Real Database Schema Lineage (No Fabricated Columns) | Master Architectural Directive | Section 5 & Section 11.2 |
| True Gang of Four Builder Pattern | Master Architectural Directive | Section 9.1 & Section 9.2 |
| Decoupled Cardinality vs. Aggregation | Master Architectural Directive | Section 7.2 |
