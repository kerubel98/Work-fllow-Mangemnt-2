# Code & Architectural Audit Report: Workflow Studio, Flowchart DAG Visual Engine, Multi-Stage Pipeline Compilation & Workflow Bundles

**Audit ID**: `AUD-WORKFLOW-STUDIO-2026-11-25`  
**Date**: 2026-11-25  
**Auditor**: Antigravity Autonomous Code Audit Engine  
**Governing Skill**: [`.agents/skills/code-audit/SKILL.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/code-audit/SKILL.md)  
**Governing Invariants & Principles**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rule 1: PostgreSQL Reality, Rule 2: Validation Result ≠ Pipeline Action, Rule 7: Maker-Checker Dual Authorization, Rule 21: Four-Tier Flowchart DAG Invariance & Explicit Pipeline Database Scoping, Rule 22: Anti-Premature Certification & Zero-Assumption Reality Gate)  
**Target Scope**: Workflow Studio Flowchart (`WorkflowStudioFlowchart.tsx`), Workflow Inspector (`WorkflowInspector.tsx`), Multi-Stage Pipeline Compiler (`validationPipelineBuilder.ts`), Workflow Bundles (`workflowBundles.ts`, `workflowBundleService.ts`), and Workflow REST Endpoints (`workflows.ts`)  
**Branch / Commit**: `feature/frontend-redesign` (`d7bf228`)  
**Status**: `OPEN`  

---

## 1. Executive Summary

An exhaustive code audit was executed on the **Workflow Studio, Flowchart DAG Visual Engine, Multi-Stage Pipeline Compilation & Workflow Bundles** subsystem. This subsystem governs the visual drag-and-drop authoring of reconciliation pipelines, stage-aware Kahn's topological sort compiling, immutable evidence snapshots, composite workflow bundle packaging, and live query preview sandboxes.

The audit revealed that while the subsystem provides advanced visual canvas capabilities and stage-based column inheritance, **6 significant defects** (**2 CRITICAL**, **3 HIGH**, **1 MEDIUM**, **0 LOW**) compromise system security and pipeline correctness. Most critically, an unescaped SQL injection vulnerability exists in the query sandbox preview route, and a prefix mismatch between canvas node IDs and stage IDs completely vacates Kahn's cycle detection algorithm, allowing cyclic workflows to compile without error.

| Severity | Count | Summary of Key Vulnerabilities / Risks |
| :--- | :---: | :--- |
| **CRITICAL** | 2 | Raw SQL injection in `POST /api/workflows/query-sandbox/preview` via unsanitized `targetDataSource` and `selectedColumns`; vacuous Kahn's DAG cycle detection in `validationPipelineBuilder.ts` due to `node-` vs `stage-` ID mismatch. |
| **HIGH** | 3 | Unauthenticated `PUT /:id` and `DELETE /:id` on workflows and query extractions; Anti-Self-Approval bypass in workflow bundle promotion review via client-supplied `checkerId`; silent production rule definition corruption via modulo validation box fallback in `WorkflowStudioFlowchart.tsx:444`. |
| **MEDIUM** | 1 | Missing transaction isolation on workflow deletion leading to orphaned query extractions and execution history records. |
| **LOW** | 0 | None identified in this scope. |

---

## 2. Previous Audit and Sign-Off Review

The master audit register ([`agent-handoffs/audit/master-audit.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/master-audit.md)) tracks 9 completed audit reports across Core Investigation, Intake, Mapping, Database Governance, Auth/OAuth, Universal Hashtags, Sandbox Escalations, Cases Page, and Team Workspace, totaling 40 open findings.

This audit (`AUD-WORKFLOW-STUDIO-2026-11-25`) establishes the 10th audit scope, verifying the core workflow authoring and compilation pipeline.

---

## 3. Files & Modules Examined

### Backend Routes & Services
- [`backend/src/routes/workflows.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/workflows.ts): Workflow CRUD, stage-aware hydration, column configuration batch attachment, query extractions, and query sandbox preview.
- [`backend/src/routes/workflowBundles.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/workflowBundles.ts): Workflow bundle lifecycle, promotion proposal, and Maker-Checker review.
- [`backend/src/services/workflowBundleService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/workflowBundleService.ts): Atomic bundle creation, immutable evidence snapshot generation, and promotion review.
- [`backend/src/services/validationPipelineBuilder.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/validationPipelineBuilder.ts): Topological sort, Kahn's algorithm DAG cycle detection, multi-row cardinality policy compilation, and fluent builder API.

### Frontend Components
- [`frontend/src/components/settings/WorkflowStudioFlowchart.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/settings/WorkflowStudioFlowchart.tsx): Visual flowchart canvas, node/connection state management, linear-to-DAG conversion, and snapshot serialization.
- [`frontend/src/components/settings/workflow/WorkflowInspector.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/settings/workflow/WorkflowInspector.tsx): Selected node/stage inspector, database binding, cardinality policy, and aggregation controls.
- [`frontend/src/components/settings/workflow/WorkflowStagesView.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/settings/workflow/WorkflowStagesView.tsx): Linear stage and step configuration tables.

---

## 4. Findings Summary Table

| Finding ID | Severity | Category | Location | Summary |
| :--- | :---: | :--- | :--- | :--- |
| `AUD-WFS-001` | **CRITICAL** | Injection & Security | `backend/src/routes/workflows.ts:347-364` | Raw SQL injection in `POST /api/workflows/query-sandbox/preview` via unsanitized `targetDataSource` and `selectedColumns`. |
| `AUD-WFS-002` | **CRITICAL** | Pipeline Correctness (Rule 21 & 22) | `validationPipelineBuilder.ts:367-372`; `WorkflowStudioFlowchart.tsx:1334, 1508` | Vacuous DAG cycle detection: `validationPipelineBuilder` matches stage IDs against node IDs, causing Kahn's algorithm to evaluate 0 edges and pass cyclic graphs. |
| `AUD-WFS-003` | **HIGH** | Authorization & Data Loss | `backend/src/routes/workflows.ts:235-271, 310-330` | Unauthenticated `PUT /:id` and `DELETE /:id` routes allow arbitrary modification and deletion of production workflows and query extractions. |
| `AUD-WFS-004` | **HIGH** | Maker-Checker Invariant (Rule 7) | `backend/src/routes/workflowBundles.ts:107-120`; `workflowBundleService.ts:199-201` | Anti-Self-Approval bypass in workflow bundle promotion review via trusted client-supplied `req.body.checkerId`. |
| `AUD-WFS-005` | **HIGH** | Data Integrity & Workflow Logic | `frontend/src/components/settings/WorkflowStudioFlowchart.tsx:444` | Silent production rule corruption: missing validation box fallback uses modulo index `safeBoxes[sIdx % safeBoxes.length]`, binding random rules to steps. |
| `AUD-WFS-006` | **MEDIUM** | Relational Integrity (Rule 1) | `backend/src/routes/workflows.ts:263-271`; `postgresRepo.ts` | Deleting a workflow leaves orphaned query extractions (`query_extractions`) and execution records without transactional cascading. |

---

## 5. Detailed Findings

### AUD-WFS-001: Raw SQL Injection in Query Sandbox Preview Endpoint
- **Severity**: CRITICAL
- **Status**: OPEN
- **Category**: Injection & Remote Code Execution
- **Location**: [`backend/src/routes/workflows.ts#L347-L364`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/workflows.ts#L347-L364)
- **Evidence**:
  ```typescript
  const columns = extraction.selectedColumns && extraction.selectedColumns.length > 0
    ? extraction.selectedColumns.map((c: any) => c.alias ? `${c.sourceColumn} AS ${c.alias}` : c.sourceColumn).join(', ')
    : '*';
  ...
  const previewQuery = `SELECT ${columns} FROM ${extraction.targetDataSource} LIMIT 10;`;
  const queryRes = await executeLiveQueryOnDb(db, previewQuery);
  ```
- **Description**: In `POST /api/workflows/query-sandbox/preview`, client-provided `targetDataSource` and `selectedColumns[].sourceColumn` are directly concatenated into a raw SQL query string and dispatched to the target database via `executeLiveQueryOnDb`. No parameterization, identifier escaping, or allowlist validation is performed. A caller can supply `targetDataSource: "users; DROP TABLE database_validation_workflows; --"` or inject arbitrary subqueries to exfiltrate database credentials and secrets.
- **Impact**: Full database compromise; execution of unauthorized DDL/DML statements against connected production or external databases.
- **Conditions for Occurrence**: Calling `POST /api/workflows/query-sandbox/preview` with crafted extraction payload.
- **Recommended Remediation**:
  1. Validate `extraction.targetDataSource` against registered tables in `database_table_mappings`.
  2. ANSI-quote all column and table identifiers (`"col"`, `"table"`).
  3. Prohibit raw SQL strings; execute only parameterized projections.
- **Verification Criteria**: Submitting `targetDataSource: "transactions; SELECT pg_sleep(5);"` is rejected with HTTP 400 validation error.

---

### AUD-WFS-002: Vacuous DAG Cycle Detection via Node ID vs Stage ID Prefix Mismatch
- **Severity**: CRITICAL
- **Status**: OPEN
- **Category**: Pipeline DAG Invariance & Anti-Premature Certification (Rules 21 & 22)
- **Location**: [`backend/src/services/validationPipelineBuilder.ts#L367-L372`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/validationPipelineBuilder.ts#L367-L372); [`frontend/src/components/settings/WorkflowStudioFlowchart.tsx#L1334, L1508-L1516`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/settings/WorkflowStudioFlowchart.tsx#L1334)
- **Evidence**:
  In `WorkflowStudioFlowchart.tsx`:
  ```typescript
  // Stage ID is prefixed with 'stage-' (line 1334)
  const stages: ProcessingStage[] = validationNodes.map((n, idx) => ({
    id: `stage-${n.id || idx + 1}`,
    ...
  }));

  // Connection endpoints retain raw node IDs (lines 1508-1516)
  const cleanConnections: FlowchartConnection[] = (connections || []).filter(Boolean).map((c, idx) => ({
    fromNodeId: String(c.fromNodeId || ''),
    toNodeId: String(c.toNodeId || ''),
    ...
  }));
  ```
  In `validationPipelineBuilder.ts`:
  ```typescript
  const stageIds = stages.map(s => s.id); // e.g. ['stage-node-1', 'stage-node-2']
  ...
  // Populate adjacency list (lines 367-372)
  for (const conn of connections) {
    if (adj.has(conn.fromNodeId) && adj.has(conn.toNodeId)) {
      adj.get(conn.fromNodeId)!.push(conn.toNodeId);
      inDegree.set(conn.toNodeId, (inDegree.get(conn.toNodeId) || 0) + 1);
    }
  }
  ```
- **Description**: `WorkflowStudioFlowchart` generates stages with IDs prefixed with `stage-` (`stage-node-1`), while connections connect visual nodes (`node-1` to `node-2`). When `validationPipelineBuilder.compile` runs Kahn's algorithm, `adj.has(conn.fromNodeId)` checks for `node-1` in an adjacency map keyed by `stage-node-1`. Because the keys never match, `adj.has()` is permanently `false` for every connection in the workflow. The adjacency graph is initialized with 0 edges, and Kahn's algorithm reports `isAcyclic: true` unconditionally, even for explicitly cyclic graphs (e.g. Node A -> Node B -> Node A).
- **Impact**: Severe architectural false-positive (Rule 22); workflows containing circular validation dependencies compile and execute, causing infinite execution loops or stack overflow crashes during batch reconciliation.
- **Conditions for Occurrence**: Any workflow saved from `WorkflowStudioFlowchart` that is compiled by `validationPipelineBuilder`.
- **Recommended Remediation**:
  Normalize connection endpoints in `validateDagAcyclicity` to match stage IDs:
  ```typescript
  const resolveStageId = (nodeId: string) =>
    adj.has(nodeId) ? nodeId : (adj.has(`stage-${nodeId}`) ? `stage-${nodeId}` : null);
  ```
- **Verification Criteria**: Passing a cyclic workflow (Node A -> Node B -> Node A) to `validationPipelineBuilder.compile` throws a fatal `COMPILATION_ERROR`.

---

### AUD-WFS-003: Unauthenticated Workflow Mutation, Deletion, and Query Extraction Manipulation
- **Severity**: HIGH
- **Status**: OPEN
- **Category**: Authorization & Data Loss Prevention (Rule 17)
- **Location**: [`backend/src/routes/workflows.ts#L235-L271, L310-L330`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/workflows.ts#L235-L271)
- **Evidence**:
  ```typescript
  // DELETE /api/workflows/:id - Delete workflow
  workflowsRouter.delete('/:id', async (req: Request, res: Response) => {
    try {
      const success = await repo.deleteWorkflow(req.params.id);
      if (!success) return res.status(404).json({ error: 'Workflow not found' });
      return res.json({ success: true, message: 'Workflow deleted successfully' });
  ```
- **Description**: `workflowsRouter.delete('/:id')`, `workflowsRouter.put('/:id')`, and query extraction modification endpoints lack all authentication and authorization checks. Any anonymous user can send a `DELETE` request to delete production reconciliation workflows, or send a `PUT` request with arbitrary steps to alter financial matching rules.
- **Impact**: Unauthorized deletion or tampering with core bank settlement workflows.
- **Conditions for Occurrence**: Direct HTTP requests to `/api/workflows/:id` or `/api/workflows/query-extractions/:id`.
- **Recommended Remediation**:
  Apply authentication middleware (`requireAuth`) and verify that the user is an admin or belongs to the team that owns the workflow (`teamId`).
- **Verification Criteria**: Unauthenticated requests to `DELETE /api/workflows/:id` return HTTP 401.

---

### AUD-WFS-004: Anti-Self-Approval Bypass on Workflow Bundle Promotion Review
- **Severity**: HIGH
- **Status**: OPEN
- **Category**: Maker-Checker Dual Authorization (Rule 7)
- **Location**: [`backend/src/routes/workflowBundles.ts#L107-L120`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/workflowBundles.ts#L107-L120); [`backend/src/services/workflowBundleService.ts#L199-L201`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/workflowBundleService.ts#L199-L201)
- **Evidence**:
  In `workflowBundles.ts:110`:
  ```typescript
  const { checkerId, checkerName, action, feedback } = req.body;
  ```
  In `workflowBundleService.ts:199`:
  ```typescript
  // Anti-Self-Approval Enforcement (Rule 7)
  if (current.maker_id === checkerId) {
    throw new Error(`Anti-Self-Approval Violation: Maker '${current.maker_name}' cannot approve their own workflow bundle promotion.`);
  }
  ```
- **Description**: The endpoint `POST /api/workflow-bundles/:id/review` reads `checkerId` directly from `req.body.checkerId` rather than from verified JWT token state (`req.user.id`). A maker can submit another user's ID as `checkerId` in the JSON body, bypassing the `current.maker_id === checkerId` anti-self-approval check and self-promoting their bundle to `GLOBAL_ENTERPRISE`.
- **Impact**: Violation of the Four-Eyes Principle (Rule 7); unverified workflows promoted to enterprise-wide production.
- **Conditions for Occurrence**: Calling `POST /api/workflow-bundles/:id/review` with a forged `checkerId` in the body.
- **Recommended Remediation**:
  Force `checkerId = (req as any).user?.id` and reject if `!checkerId`.
- **Verification Criteria**: Supplying a third-party `checkerId` in the request body while authenticated as the maker is rejected with HTTP 403.

---

### AUD-WFS-005: Silent Production Rule Definition Corruption via Modulo Validation Box Fallback
- **Severity**: HIGH
- **Status**: OPEN
- **Category**: Data Integrity & Flowchart DAG Invariance (Rule 21)
- **Location**: [`frontend/src/components/settings/WorkflowStudioFlowchart.tsx#L444`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/settings/WorkflowStudioFlowchart.tsx#L444)
- **Evidence**:
  ```typescript
  const box = safeBoxes.find(b => b && (
    b.id === (step as any)?.boxId ||
    b.id === step?.id ||
    (b.name && step?.name && b.name.trim().toLowerCase() === step.name.trim().toLowerCase())
  )) || stageBoxes[0] || (safeBoxes.length > 0 ? safeBoxes[sIdx % safeBoxes.length] : undefined);
  ```
- **Description**: In `convertStagesToFlowchart`, if a workflow step refers to a validation box that was deleted, renamed, or not yet loaded in the client state, the fallback selects an arbitrary, unrelated validation box using modulo index: `safeBoxes[sIdx % safeBoxes.length]`. That random box's ID, search parameters, category, and target DB are assigned to the node. When the operator saves the workflow, the corrupted node definition is written back to PostgreSQL, replacing the original validation rule with a completely unrelated one.
- **Impact**: Silent corruption of financial validation logic; arbitrary rules executed during reconciliation.
- **Conditions for Occurrence**: Loading a workflow in Workflow Studio where any step references a deleted or unhydrated validation box.
- **Recommended Remediation**:
  Remove the modulo fallback. If a validation box is not found, construct an unlinked custom step node (`boxId: undefined`) with the step's existing name and parameters, and warn the operator with an alert: `"Unlinked rule block detected on step X"`.
- **Verification Criteria**: Loading a workflow with an unmapped step preserves the step's original properties and does not bind an arbitrary validation box.

---

### AUD-WFS-006: Missing Transaction Isolation in Workflow Deletion Leading to Orphaned Records
- **Severity**: MEDIUM
- **Status**: OPEN
- **Category**: Relational Persistence & Referential Integrity (Rule 1)
- **Location**: [`backend/src/routes/workflows.ts#L263-L271`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/workflows.ts#L263-L271); `postgresRepo.ts`
- **Evidence**:
  ```typescript
  workflowsRouter.delete('/:id', async (req: Request, res: Response) => {
    try {
      const success = await repo.deleteWorkflow(req.params.id);
  ```
- **Description**: Deleting a workflow deletes only the row from `database_validation_workflows`. Child entities in `query_extractions`, `workflow_bundles`, and `task_workflow_executions` are not checked or transactionally deleted, leaving dangling references and foreign key violations in PostgreSQL.
- **Impact**: Database schema inconsistency; orphaned historical records.
- **Conditions for Occurrence**: Deleting a workflow that has associated query extractions or workflow bundles.
- **Recommended Remediation**:
  Wrap deletion in a database transaction (`withTransaction`) that cascades or blocks deletion if referenced by active workflow bundles.
- **Verification Criteria**: Attempting to delete a workflow bound to an active bundle returns HTTP 409 Conflict.

---

## 6. Positive Observations

1. **Explicit Multi-Row Cardinality Policies (Rule 21)**:
   Lines 247-285 of `validationPipelineBuilder.ts` enforce explicit cardinality policies (`STRICT_SINGLE`, `ALLOW_MULTIPLE_MATCHES`, `EXPLICIT_LATEST`, `EXPLICIT_FIRST`) and require `orderByColumn` when temporal extraction is requested.
2. **Immutable Evidence Snapshots**:
   Lines 81-107 of `workflowBundleService.ts` freeze a complete snapshot of the workflow DAG, validation boxes, and database mappings at the time of bundle creation.
3. **Column Configuration Batch Hydration**:
   Lines 9-87 of `workflowsRouter.ts` provide comprehensive batch hydration of attached column configurations across stages and steps.
4. **Clean Verification Suites**:
   Backend test suite passes 100% (39/39 test files, 312 tests); frontend bundles cleanly in 16.55s.

---

## 7. Remediation Plan

1. **Remediation Priority**:
   - **Step 1 (AUD-WFS-001)**: Sanitize and parameterize query sandbox preview queries; eliminate raw SQL concatenation.
   - **Step 2 (AUD-WFS-002)**: Fix node ID / stage ID prefix resolution in `validationPipelineBuilder.ts` to restore Kahn's cycle detection.
   - **Step 3 (AUD-WFS-003 & AUD-WFS-004)**: Authorize workflow mutations and enforce JWT identity on workflow bundle reviews.
   - **Step 4 (AUD-WFS-005)**: Remove modulo box fallback in `WorkflowStudioFlowchart.tsx`.
   - **Step 5 (AUD-WFS-006)**: Implement transactional cascading deletion on workflows.
2. **Remediation Execution**:
   To begin implementing fixes, run `/sign-off` targeting this scope.

---

## 8. Audit Conclusion & Sign-Off Readiness

- **Audit Result**: `OPEN` (Remediation Required).
- **Severity Breakdown**: 2 Critical, 3 High, 1 Medium, 0 Low.
- **Sign-Off Status**: **BLOCKED** until `AUD-WFS-001` (SQL Injection) and `AUD-WFS-002` (Vacuous Cycle Detection) are remediated and verified.

---

## 9. References & Invariant Mapping

- [Master Audit Register](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/master-audit.md)
- [Audit Reports Index](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/agent-handoffs/audit/reports/INDEX.md)
- [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md)
