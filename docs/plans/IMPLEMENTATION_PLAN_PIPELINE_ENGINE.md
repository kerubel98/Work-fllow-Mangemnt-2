# Master Implementation Plan: Operational Pipeline Engine

**Document Version:** 2.0.0  
**Target Specification:** [`PIPELINE_ENGINE_MASTER_ARCHITECTURE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/PIPELINE_ENGINE_MASTER_ARCHITECTURE.md)  
**Governing Skill:** [`bo-operational-governance`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/bo-operational-governance/SKILL.md)  
**Governing Rules:** [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rules 1, 2, 7, 10, 11, 13, 17, 18, 19, 20)  
**Historical ADRs:** [`DECISION_LOG.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/DECISION_LOG.md) (ADR-001 through ADR-005)  
**Project Baseline:** [`CURRENT_PROJECT_CONTEXT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/CURRENT_PROJECT_CONTEXT.md)  
**Governance Status:** `MANDATORY REPOSITORY ALIGNMENT & SYSTEM SPECIFICATION`

---

## 1. Executive Overview & Governance Workflow

This implementation plan defines the exact, evidence-based sequence of steps required to align the operational pipeline engine with [`PIPELINE_ENGINE_MASTER_ARCHITECTURE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/PIPELINE_ENGINE_MASTER_ARCHITECTURE.md).

In strict adherence to **Rule 20** (*Evidence-Based Persistent-State Modification*) and the **Mandatory 6-Phase Workflow** (`bo-operational-governance/SKILL.md` §5), this plan establishes:
1. **The "DO NOT INVENT" Gate:** No speculative database columns, unconfigured external systems (Kafka, Redis), or arbitrary thresholds (`confidence >= 0.95`) may be introduced. All implementations must map strictly to verified repository reality.
2. **The 8-Milestone Structure (Milestones 0 to 7):** Structured linearly from empirical discovery through type decoupling, builder compilation, orchestrator execution, to frontend binding.
3. **The Mandatory 10-Point Evidence Artifact:** Every milestone requires recording a verified evidence artifact before implementation is approved.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        6-PHASE GOVERNANCE LIFECYCLE                    │
├────────────────────────────────────────────────────────────────────────┤
│ Phase 1: Inspect   ──► Verify active code & schema invariants [DONE]   │
│ Phase 2: Analyze   ──► Cross-layer consistency & risk assessment [DONE] │
│ Phase 3: Plan      ──► 8-Milestone hardened implementation plan [HERE] │
│ Phase 4: Approval  ──► Review and sign-off on plan milestones          │
│ Phase 5: Modify    ──► Incremental, test-driven code implementation    │
│ Phase 6: Verify    ──► Type checks, unit tests, integration tests      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Architectural Changes & Objectives

1. **The True Gang of Four Builder Pattern:**
   - The Builder (`ValidationPipelineBuilder`) compiles declarative workflows or fluently assembled stages into an immutable `CompiledValidationPlan`.
   - The Director (`InvestigationOrchestratorService`) executes **strictly and exclusively** from `compiledPlan.stages`.
   - Compilation is a mandatory gate: If a graph contains cycles, unconfigured cardinality policies, or unresolvable joins, compilation throws a `CONFIGURATION_ERROR`. Empty `try/catch` blocks with `console.warn` are prohibited.

2. **Decouple Cardinality Policy from Aggregation Strategy:**
   - Decouple **Cardinality** (`STRICT_SINGLE`, `ONE_TO_MANY`, `EXPLICIT_LATEST`, `EXPLICIT_FIRST`, `ALL_ROWS`, `REQUIRE_MANUAL_SELECTION`) from **Aggregation** (`NONE`, `SUM`, `COUNT`, `MIN`, `MAX`, `CUSTOM`).
   - Forbid silent defaults. Require explicit `orderByColumn` for `EXPLICIT_LATEST` / `EXPLICIT_FIRST`.

3. **Four-Pillar Decoupling & Output Contract Partitioning:**
   - Maintain strict separation across:
     - **Validation Result:** `PASS` | `FAIL` | `ERROR`
     - **Infrastructure Condition:** `HEALTHY` | `DB_OFFLINE` | `TIMEOUT` | `CONFIGURATION_ERROR`
     - **Pipeline Action:** `CONTINUE` | `CLOSE` | `STOP`
     - **Stage Output Contract:** Partitioned into `StageExecutionSummary` (batch metrics) and `StageRowExecutionResult` (per-row forensic snapshots).

4. **Real Database Schema Lineage:**
   - Ground lineage strictly in physical PostgreSQL columns:
     - `mirror_{db}_{table}`: `_mirror_id`, `_batch_id`, `_rule_block_id`, `_validation_status`, `_validation_action`, `_validation_details`, `_mirrored_at`.
     - `task_dataset_transactions`: `task_id`, `row_number`, `data`.
   - Never fabricate imaginary physical columns (`workflow_execution_id`, `stage_execution_id`) in mirror table SQL queries.

5. **Granular Lineage Tracking vs. Blunt Taint:**
   - Eliminate `isDiagnosticOnly: true`.
   - Track `RowExecutionLineage` (`inputQuality: 'VERIFIED_CLEAN' | 'UPSTREAM_FAILED_BUT_HYDRATED'`, `stagesTraversed`).
   - Allow forensic downstream investigation of upstream failures (e.g. orphan settlements).

6. **Anti-Contamination via Explicit Workflow Binding:**
   - Workflow stages explicitly declare `attachedDbConfigIds: string[]`.
   - Global auto-loading of all table rules is strictly prohibited.

7. **Lineage-Aware Discrepancy Aggregator:**
   - Aggregates both PASS and FAIL reports across all pipeline stages.
   - Accurately classifies `VERIFIED_MATCH`, `ORPHAN_SETTLEMENT`, `UNSETTLED_AUTHORIZATION`, and `SETTLEMENT_AMOUNT_MISMATCH`.

---

## 3. The 8-Milestone Implementation Sequence

```text
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                           IMPLEMENTATION ROADMAP                            │
 ├─────────────────────────────────────────────────────────────────────────────┤
 │ Milestone 0: Discovery & Ground Truth Audit                                 │
 │              • Empirically inspect DB migrations, repository methods, types │
 │              • Confirm zero unmigrated columns or invented models           │
 │                                                                             │
 │ Milestone 1: Core Type Contracts & Four-Pillar Decoupling                   │
 │              • types.ts (backend & frontend) alignment                      │
 │              • StageExecutionSummary + StageRowExecutionResult              │
 │              • Decoupled MultiRowCardinalityPolicy vs. AggregationStrategy  │
 │                                                                             │
 │ Milestone 2: The True Builder Pattern & Plan Compilation                    │
 │              • validationPipelineBuilder.ts fluent API & compiler           │
 │              • Topological DAG sorting, cardinality check, attached configs │
 │                                                                             │
 │ Milestone 3: NextStageInputResolver with Real Schema Lineage                │
 │              • nextStageInputResolver.ts key-driven resolution              │
 │              • Uses real mirror columns (_batch_id, _rule_block_id)         │
 │                                                                             │
 │ Milestone 4: Plan-Driven Investigation Orchestrator Engine                  │
 │              • investigationOrchestratorService.ts executes compiled plan   │
 │              • Removal of toothless try/catch & raw stage loops             │
 │                                                                             │
 │ Milestone 5: Explicit DB Configuration Scoping & Binding                   │
 │              • attachedDbConfigIds validation in postgresRepo.ts            │
 │              • Execution inside Stage Reconciliation Method                 │
 │                                                                             │
 │ Milestone 6: Lineage-Aware Discrepancy Aggregator                           │
 │              • statusAggregator.ts multi-stage report evaluation            │
 │              • Business classification for orphan settlements & variances   │
 │                                                                             │
 │ Milestone 7: Studio & Workflow Inspector DB Config Binding UI               │
 │              • WorkflowStudioFlowchart.tsx & WorkflowInspector.tsx          │
 │              • Interactive selection of attachedDbConfigIds & cardinality   │
 └─────────────────────────────────────────────────────────────────────────────┘
```

---

### Milestone 0: Discovery & Ground Truth Audit
**Governance Status:** `PREREQUISITE - REQUIRED BEFORE CODE MODIFICATIONS`

#### Objectives:
1. Audit physical PostgreSQL tables via `backend/src/database/migrations/001_initial_schema.sql` and `mirrorTableManager.ts`.
2. Confirm the exact physical schema of `mirror_{db}_{table}`, `task_dataset_transactions`, `issues`, `database_validation_workflows`, `validation_boxes`, and `database_column_configurations`.
3. Verify that no speculative columns or unapproved infrastructure dependencies exist.

#### Deliverables:
- Milestone 0 Evidence Artifact confirming physical table column schemas and active repository boundaries.

---

### Milestone 1: Core Type Contracts & Four-Pillar Decoupling
**Governance Status:** `REQUIRED BEFORE IMPLEMENTATION`

#### Objectives:
1. Synchronize authoritative TypeScript contracts between backend and frontend.
2. Formally decouple Verdict (`PASS` | `FAIL` | `ERROR`), Infrastructure Condition (`HEALTHY` | `DB_OFFLINE` | `TIMEOUT` | `CONFIGURATION_ERROR`), Pipeline Action (`CONTINUE` | `CLOSE` | `STOP`), and Stage Output Contract.
3. Partition `StageOutputContract` into `StageExecutionSummary` and `StageRowExecutionResult`.
4. Decouple `MultiRowCardinalityPolicy` from `AggregationStrategy`.
5. Remove `isDiagnosticOnly: boolean` and update `RowExecutionLineage`.

#### Impacted Files:
- [`backend/src/types.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/types.ts)
- [`frontend/src/types.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/types.ts)

#### Authoritative Type Definitions:
```typescript
// 1. Cardinality & Aggregation Decoupled Models
export type MultiRowCardinalityPolicy =
  | 'STRICT_SINGLE'           // Asserts exactly 1 row. >1 rows raises AMBIGUOUS_CARDINALITY_ERROR unless aggregated
  | 'ONE_TO_MANY'             // Preserves all returned rows, fanning out downstream checks
  | 'EXPLICIT_LATEST'         // Selects newest row; REQUIRES explicit orderByColumn (e.g. auth_timestamp DESC)
  | 'EXPLICIT_FIRST'          // Selects oldest row; REQUIRES explicit orderByColumn (e.g. created_at ASC)
  | 'ALL_ROWS'                // Preserves raw returned row set without fanout
  | 'REQUIRE_MANUAL_SELECTION'; // Flags ambiguous rows for Maker-Checker human review

export type AggregationStrategy =
  | 'NONE'
  | 'SUM'
  | 'COUNT'
  | 'MIN'
  | 'MAX'
  | 'CUSTOM';

// 2. Partitioned Stage Output Contract
export interface StageExecutionSummary {
  stageId: string;
  stageName: string;
  order: number;
  batchId: string;
  ruleBlockId: string;
  executedAt: string;
  durationMs: number;
  totalRows: number;
  passedRows: number;
  failedRows: number;
  errorRows: number;
  mirrorTableName?: string;
  producedKeys: string[];
}

export interface StageRowExecutionResult {
  rowNumber: number;
  matchFound: boolean;
  validationResult: 'PASS' | 'FAIL' | 'ERROR';
  infrastructureCondition: 'HEALTHY' | 'DB_OFFLINE' | 'TIMEOUT' | 'CONFIGURATION_ERROR';
  pipelineAction: 'CONTINUE' | 'CLOSE' | 'STOP';
  discrepancyReasons?: string[];
  candidateKeys: string[];
  extractedFields: Record<string, any>;
  mirrorRecordSnapshot?: Record<string, any>;
}

export interface StageOutputContract {
  summary: StageExecutionSummary;
  rowResults: StageRowExecutionResult[];
}

// 3. Row Execution Lineage (Granular Data Quality)
export interface RowExecutionLineage {
  taskId: string;
  batchId: string;
  rowNumber: number;
  stagesTraversed: Array<{
    stageId: string;
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

#### Verification Criteria:
- TypeScript compilation passes: `npm run build` or `npx tsc --noEmit` across backend and frontend.

---

### Milestone 2: The True Gang of Four Builder Pattern & Plan Compilation
**Governance Status:** `REQUIRED BEFORE IMPLEMENTATION`

#### Objectives:
1. Upgrade `validationPipelineBuilder.ts` into a complete Gang of Four Builder.
2. Implement the fluent assembly API (`PipelineBuilder`, `StageBuilder`) for programmatic workflow construction.
3. Implement `compile(workflow: DatabaseValidationWorkflow): CompiledValidationPlan`:
   - Enforce DAG acyclicity via Kahn's algorithm (topological sorting).
   - Enforce explicit `cardinalityPolicy` (fail-fast on missing policy or missing `orderByColumn`).
   - Enforce explicit `attachedDbConfigIds` validation against PostgreSQL.
   - Pre-index table relationships and schema bridge keys.
4. Eliminate empty `try/catch` blocks: When compilation fails, it throws a fatal `CONFIGURATION_ERROR` that halts execution immediately.

#### Impacted Files:
- [`backend/src/services/validationPipelineBuilder.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/validationPipelineBuilder.ts)
- [`backend/src/services/__tests__/validationPipelineBuilder.test.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/__tests__/validationPipelineBuilder.test.ts)

#### Verification Criteria:
- Unit tests verify:
  - Cycle detection throws `COMPILATION_ERROR`.
  - Missing cardinality policy throws `COMPILATION_ERROR`.
  - Fluent builder constructs valid `CompiledValidationPlan`.
  - Topological sorting accurately orders multi-stage pipelines.

---

### Milestone 3: NextStageInputResolver with Real Schema Lineage
**Governance Status:** `REQUIRED BEFORE IMPLEMENTATION`

#### Objectives:
1. Ensure `nextStageInputResolver.ts` routes data based on key requirements and partitioned output contracts (`StageOutputContract`).
2. Map lineage strictly through real PostgreSQL structures: `_batch_id`, `_rule_block_id`, `task_id`, `row_number`.
3. Support decoupled usability: If Stage $N$ yielded `FAIL + CONTINUE` with hydrated mirror records, provide the mirror table reference tagged with `inputQuality: 'UPSTREAM_FAILED_BUT_HYDRATED'`.
4. Implement ancestor walking for 404 Missing Ingress cases, falling back to the raw task dataset if intermediate lookups yielded no rows.

#### Impacted Files:
- [`backend/src/services/nextStageInputResolver.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/nextStageInputResolver.ts)
- [`backend/src/services/__tests__/nextStageInputResolver.test.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/__tests__/nextStageInputResolver.test.ts)

#### Verification Criteria:
- Unit tests verify resolution for PASS stages, FAIL + CONTINUE stages, Missing Ingress ancestor fallback, and unresolvable key configuration errors.

---

### Milestone 4: Plan-Driven Investigation Orchestrator Engine
**Governance Status:** `REQUIRED BEFORE IMPLEMENTATION`

#### Objectives:
1. Refactor `investigationOrchestratorService.ts` to execute **strictly and exclusively** from `compiledPlan.stages`.
2. Remove the anti-pattern:
   ```typescript
   // REMOVE:
   try { validationPipelineBuilder.compile(workflow); } catch (e) { console.warn(e); }
   for (let stageIdx = 0; stageIdx < stages.length; stageIdx++) ...
   ```
   Replace with:
   ```typescript
   // ENFORCE:
   const compiledPlan = validationPipelineBuilder.compile(workflow, { strictCardinality: true });
   for (const stagePlan of compiledPlan.stages) ...
   ```
3. Execute stage column configurations (`attachedDbConfigIds`) inside the Stage Reconciliation Method after mirror data fetch.
4. Construct and emit partitioned `StageOutputContract` for every stage.

#### Impacted Files:
- [`backend/src/services/investigationOrchestratorService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/investigationOrchestratorService.ts)

#### Verification Criteria:
- Pipeline test suite passes: `backend/src/services/__tests__/multiStagePipelineExecution.test.ts`.
- Orchestrator halts immediately on invalid workflow DAG or missing cardinality without running database queries.

---

### Milestone 5: Explicit DB Configuration Scoping & Binding
**Governance Status:** `REQUIRED BEFORE IMPLEMENTATION`

#### Objectives:
1. Ensure `attachedDbConfigIds` declared on stages are verified during compilation against `postgresRepo.ts`.
2. Prohibit global auto-loading of table rules.
3. Ensure reconciliation evaluates only configurations explicitly bound to the stage.

#### Impacted Files:
- [`backend/src/store/postgresRepo.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/store/postgresRepo.ts)
- [`backend/src/services/investigationOrchestratorService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/investigationOrchestratorService.ts)

#### Verification Criteria:
- Tests verify that configurations belonging to another team or unattached rules are never executed.

---

### Milestone 6: Lineage-Aware Discrepancy Aggregator
**Governance Status:** `REQUIRED BEFORE IMPLEMENTATION`

#### Objectives:
1. Modernize `statusAggregator.ts` to evaluate both PASS and FAIL reports across all pipeline stages.
2. Evaluate complete multi-stage execution lineage (`stagesTraversed`, `inputQuality`, `matchFound`):
   - `Stage 1 PASS + Stage 2 PASS` ──► `VERIFIED_MATCH`
   - `Stage 1 FAIL (Missing Auth) + Stage 2 PASS (Found in Settlement)` ──► `ORPHAN_SETTLEMENT`
   - `Stage 1 PASS + Stage 2 FAIL (Missing Settlement)` ──► `UNSETTLED_AUTHORIZATION`
   - `Stage 1 PASS + Stage 2 PASS (Amount Variance)` ──► `SETTLEMENT_AMOUNT_MISMATCH`
3. Generate immutable Four-Eyes evidence snapshots for Checker review.

#### Impacted Files:
- [`frontend/src/services/statusAggregator.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/services/statusAggregator.ts)

#### Verification Criteria:
- Unit tests verify accurate business classification across all multi-stage scenarios.

---

### Milestone 7: Studio & Workflow Inspector DB Config Binding UI
**Governance Status:** `REQUIRED BEFORE IMPLEMENTATION`

#### Objectives:
1. Add interactive UI controls in `WorkflowStudioFlowchart.tsx` and `WorkflowInspector.tsx` to:
   - Select `cardinalityPolicy` and `aggregationStrategy` on stages.
   - Attach and detach database column configurations (`attachedDbConfigIds`).
2. Display data quality indicators (`VERIFIED_CLEAN`, `UPSTREAM_FAILED_BUT_HYDRATED`) in the Investigation Workspace without causing full-page unmounts.

#### Impacted Files:
- [`frontend/src/components/workflow/WorkflowStudioFlowchart.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/workflow/WorkflowStudioFlowchart.tsx)
- [`frontend/src/components/workflow/WorkflowInspector.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/workflow/WorkflowInspector.tsx)
- [`frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/investigation/ValidationOrchestratorWorkspace.tsx)

#### Verification Criteria:
- Workflow configuration persists `attachedDbConfigIds`, `cardinalityPolicy`, and `aggregationStrategy` cleanly to PostgreSQL.
- React components render without console errors or unhandled exceptions.

---

## 4. The Mandatory 10-Point Evidence Artifact Template

For each milestone, the following 10-point evidence artifact must be completed and documented:

```markdown
### Milestone Evidence Artifact: Milestone [N] - [Title]
1. **Milestone Identifier & Title:** Milestone [N] - [Title]
2. **Repository Baseline Verification:** Git commit hash, active branch, file timestamps.
3. **Database Schema Reality:** Physical PostgreSQL tables and columns inspected via migrations.
4. **Governing Architecture Section:** Cross-link to `PIPELINE_ENGINE_MASTER_ARCHITECTURE.md` §[X].
5. **Decoupling Invariant Check:** Confirmation of strict 4-pillar separation (Verdict, Condition, Action, OutputContract).
6. **No-Fabrication Verification:** Affirmation that zero invented columns or unmigrated structures were introduced.
7. **Fail-Fast Error Verification:** Demonstration that invalid configurations halt with `CONFIGURATION_ERROR`.
8. **Test Coverage Specification:** Unit, regression, and failure cases executed and passing.
9. **Dry-Run & Impact Assessment:** Verification that existing production flows remain intact.
10. **Checker Review Checklist:** Four-Eyes review criteria and architectural sign-off.
```

---

## 5. Risk Mitigation & Invariant Checklist

| Risk | Mitigation Strategy | Enforcing Governance Rule |
| :--- | :--- | :--- |
| **Data Loss during cleanup or schema updates** | Mandatory dry-run sequence (`IDENTIFY` → `SELECT` → `VERIFY` → `DRY RUN` → `REPORT` → `APPROVE` → `MODIFY` → `VERIFY`). | `AGENTS.md` Rule 17 |
| **Silent row drops on duplicate keys** | Forbid silent `LATEST` default. Enforce explicit `MultiRowCardinalityPolicy` and `AggregationStrategy`. | `PIPELINE_ENGINE_MASTER_ARCHITECTURE.md` §7 |
| **Cross-execution run pollution** | Enforce composite execution joins `(_batch_id, _rule_block_id, row_number)` instead of bare `task_id`. | `AGENTS.md` Rule 13, Master Architecture §5 |
| **Rule contamination across workflows** | Stage-level explicit `attachedDbConfigIds` binding. No global table rule auto-loading. | `PIPELINE_ENGINE_MASTER_ARCHITECTURE.md` §10 |
| **Toothless DAG compilation** | Throws fatal `CONFIGURATION_ERROR` on cycles or invalid configurations; orchestrator runs strictly from compiled plan. | `PIPELINE_ENGINE_MASTER_ARCHITECTURE.md` §9 |
| **Blank screen React unmounts** | Wrap workspace views in `<ErrorBoundary>` and serialize JSONB objects safely. | `AGENTS.md` Rule 6 |
