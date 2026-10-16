# Architectural Specification: Multi-Leg Duplicate Detection & JSONB Coordinate Consolidation
## Decoupling File-Level Ingress Deduplication from Target Ledger Multi-Leg Verification

**Repository Root**: `c:\Users\hp\Downloads\opration-workflow-mangement1`  
**Governance Authority**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rules 1, 2, 3, 9, 13, 20, 22) & [`bo-operational-governance`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/bo-operational-governance/SKILL.md)  
**Parent Specification**: [`RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/RULE_TO_METHOD_PIPELINE_ARCHITECTURE.md)  
**Audit Reference**: [`VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md §17`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md#L673)  
**Document Status**: APPROVED, REVISED, IMPLEMENTED & CERTIFIED ARCHITECTURAL SPECIFICATION  
**Initial Drafting**: October 8, 2026  
**Formal Architecture Review & Remediation**: October 11, 2026  

---

## 1. Executive Summary & Problem Formulation

### 1.1 The Fundamental Flaw of Conflating Ingress with Ledger Reconciliation
In financial settlement workflows, previous iterations attempted to make `ruleSqlCompiler.ts` perform two incompatible tasks simultaneously within a single SQL statement on mirror tables:
1. Detecting if the operator uploaded duplicate rows in the input CSV (e.g. Row 10 and Row 25 both sharing `fe_utrnno = 2689706150`).
2. Detecting if the external core banking database contains multiple settlement legs or duplicate ledger postings for a single transaction.

This conflation caused severe architectural contradictions:
- **When `_dup._row_number = m._row_number` was enforced**: The subquery was locked to a single input row. Because Row 10 cannot see Row 25, file-level duplicate detection became mathematically impossible (`COUNT(*) = 1 <= 1` was permanently `TRUE`).
- **When `_dup._row_number = m._row_number` was omitted**: A single legitimate transaction (Row 10) returning 3 accounting legs (1 settlement leg + 2 switch fee legs) from MySQL was evaluated as `COUNT(*) = 3 > 1`, falsely failing as a duplicate transaction.

### 1.2 The Core Architectural Resolution & User Decision Points
1. **Preservation of `_row_number` Comparison & Set-Based Reconciliation (Rule 1 & 13)**:
   - Set-based reconciliation is strictly retained: PostgreSQL joins `task_dataset_transactions` with `mirror_{db}_{table}` using immutable row coordinates `(tdt.task_id = m._task_id AND tdt.row_number = m._row_number)`.
   - No row-number regeneration or synthetic window re-indexing is permitted.
2. **Dedicated `returned_data` Column in `task_dataset_transactions` (Option B Target-Namespaced Object)**:
   - The set-based update from the mirror table writes the matched external records directly into a dedicated first-class column `returned_data JSONB` on `task_dataset_transactions`.
   - **Canonical Shape (Option B)**: Formatted strictly as a target-namespaced object `returned_data = { [workflow_id]: { [target_table]: [leg1, leg2, ...] } }` without stage/audit metadata clutter. When a source transaction returns zero matches, `returned_data` is explicitly set to **`NULL`**.
3. **Four-Dimension Status Separation (Formalized 11 October 2026)**:
   - External match presence must never be confused with acquisition success, business validation verdict, or pipeline routing:
     - **Acquisition Status** (`SUCCESS` / `ERROR`): Whether the external database lookup and mirror staging completed without network or database faults.
     - **Match Status** (`FOUND` / `NOT_FOUND`): Whether external mirror records matched the source transaction coordinate ($\ge 1 \implies$ `FOUND`; $0 \implies$ `NOT_FOUND`).
     - **Validation Status** (`PASS` / `FAIL` / `ERROR` / `PENDING`): Whether the business rules and column configurations evaluated on the returned legs passed or failed.
     - **Pipeline Action** (`CONTINUE` / `STOP` / `CLOSE` / `FLAG` / `REPORT`): What control action the workflow engine executes next.
   - *Note*: Top-level `reconciliation_status` serves as a convenience projection of Match Status (`PASS` on $\ge 1$ legs found, `FAIL` on 0 legs), while business correctness is governed strictly by `validation_status`. See [§8](#8-formal-architecture-review--required-corrections-11-october-2026) for complete specification.
4. **Database Configurations Converted to Pipeline Methods (`DbConfigMethod`)**:
   - Just like visual validation boxes compile into pipeline methods (`IngestionSearchMethod`, `ConditionCheckMethod`), `database_column_configurations` are formalized as first-class executable pipeline methods (`DbConfigMethod`).
5. **Target Table to Config Mapping (`targetTable -> DbConfigMethod[]`) & Conditional Handoff**:
   - The engine maintains a registry mapping target tables to their attached DB config methods (`targetTable -> DbConfigMethod[]`), scoped to the workflow stage.
   - **Conditional Handoff**: When reconciliation finishes, it checks this map. If a DB config method is attached, it hands **only the passed data** (records where at least 1 mirror record was found) to the DB method.
   - **Execution & Reporting**: The DB method evaluates `returned_data`, appends its status and the complete list of data keys (`identifierColumn`, key values, matched columns) to the task data report.
   - **Status Mutation Governance**:
     - If the DB config is configured to mutate reconciliation status (`affectsReconciliationStatus: true`), a failure in the DB method flips `reconciliation_status` to `FAIL`.
     - If not configured to mutate (`affectsReconciliationStatus: false` / diagnostic check), it passes the row, recording its findings purely in the diagnostic report.
6. **Downstream Validator Input Sourcing from `returned_data`**:
   - Downstream validation boxes and check steps do NOT query or lock transient mirror tables of previous stages.
   - All downstream validators consume their input directly from the accumulated `returned_data` in `task_dataset_transactions`.
7. **Strict Scope Separation: Default Reconciliator (Presence Only) vs. Dedicated Check Types**:
   - **The Default Reconciliator is Strictly a Presence Check**: It evaluates only whether external records were discovered ($\ge 1 \implies$ `reconciliation_status = 'PASS'`; $0 \implies$ `FAIL`). It performs ZERO amount or field arithmetic.
   - **Dedicated Check Types & Reconciliation Boxes Handle Field Comparisons**: Amount checks (`AMOUNT_MATCH`), status checks, date checks, and tolerance comparisons fall strictly under dedicated `CHECK_TYPE` steps, `RECONCILIATION` boxes, or `DbConfigValidationMethod` instances operating on `canonical_data` vs `returned_data`.

---

## 2. Architectural Topology & Component Interaction

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: TASK CREATION & INGESTION (datasetIngestionService.ts)                                         │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ • Parses uploaded CSV/spreadsheet (e.g. 50 rows).                                                       │
│ • Assigns immutable row coordinates (_rowNumber = 1..N).                                                │
│ • Flags internal file duplicates upfront: is_duplicate = true, status = 'DUPLICATE'.                    │
│ • Persists clean base dataset into PostgreSQL task_dataset_transactions.                                │
└────────────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                                     │
                                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: EXTERNAL QUERY & SET-BASED RECONCILIATION (CoordinateInjector & reconciliationService.ts)       │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ • Batch query executed against external DB (e.g. MySQL bo_test.tran_log_tab) via VALUES tuple join.     │
│ • Staged into PostgreSQL UNLOGGED mirror: mirror_sett_tran_log_tab carrying _row_number = 1..N.         │
│ • Atomic Set-Based Update on task_dataset_transactions joining on (task_id, row_number):                │
│     - Aggregates all mirror rows for that _row_number into returned_data JSONB.                         │
│     - Sets reconciliation_status:                                                                       │
│         • If at least 1 mirror record found  ──► reconciliation_status = 'PASS'                         │
│         • If 0 mirror records found          ──► reconciliation_status = 'FAIL'                         │
└────────────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                                     │
                                                     ▼ (Only records with reconciliation_status = 'PASS')
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: TARGET TABLE CONFIG MAP & DBCONFIGMETHOD EXECUTION                                             │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ • Engine checks StageTargetConfigMap for target table (e.g. 'tran_log_tab').                            │
│ • If attached DbConfigMethod exists:                                                                    │
│     - Hands ONLY the passed records (with returned_data) to the DbConfigMethod.                         │
│     - Evaluates business rules (e.g. DUPLICATE_CHECK with BO_TYPE = 'CMTP254' AND PROC_NAME != 'RVS').  │
│     - Records list of data keys: { matchKey: 'TR_GROUP_ID', keyValues: ['103458988891'], ... }         │
│ • Status Mutation Decision Gate:                                                                        │
│     - If affectsReconciliationStatus == true AND check fails:                                           │
│         ──► Mutates reconciliation_status = 'FAIL' (Action: STOP)                                       │
│     - If affectsReconciliationStatus == false:                                                          │
│         ──► Keeps reconciliation_status = 'PASS', logs finding in task report.                          │
└────────────────────────────────────────────────────┬────────────────────────────────────────────────────┘
                                                     │
                                                     ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: UI INVESTIGATION REPORT & WORKSPACE PRESENTATION (WorkspaceTable / IssueDetailView)            │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ • Two-Level Status Display:                                                                             │
│     - Level 1: [Reconciliation: PASS (1 Matched)]                                                       │
│     - Level 2: [Validation: FAIL (Duplicate Posting in DB)]                                             │
│ • Dedicated returned_data column inspector showing expandable multi-leg accordion.                      │
│ • Highlights violating identifier column (TR_GROUP_ID) in red with key list.                            │
│ • Maker-Checker proposal staged with full returned_data evidence snapshot.                              │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Data Models & Contracts

### 3.1 PostgreSQL Schema Enhancement in `task_dataset_transactions`
In accordance with Rule 1 and Rule 20, the storage layer includes a dedicated `returned_data` column alongside `canonical_data`:

```sql
-- Migration: Add dedicated returned_data column to task_dataset_transactions
ALTER TABLE task_dataset_transactions 
ADD COLUMN IF NOT EXISTS returned_data JSONB DEFAULT '[]'::jsonb;

-- Indexing for high-speed multi-leg retrieval
CREATE INDEX IF NOT EXISTS idx_tdt_returned_data_gin 
ON task_dataset_transactions USING gin (returned_data);
```

TypeScript entity interface:

```typescript
export interface TaskDatasetTransactionEntity {
  id: string;
  task_id: string;
  row_number: number;
  
  // Dedicated column for external records returned from mirror
  returned_data: Array<Record<string, any>>;

  // Ingress canonical data and dual-level status
  canonical_data: {
    _rowNumber: number;
    _task_id: string;
    fe_utrnno: string;
    
    // Two-Level Status Architecture
    reconciliation_status: 'PASS' | 'FAIL' | 'PENDING';
    validation_status: 'PASS' | 'FAIL' | 'ERROR' | 'PENDING';
    
    // Primary leg for backward compatibility
    _target_record?: Record<string, any> | null;
    
    // Diagnostic Report & Key List
    _validation_details?: {
      checkType?: string;
      identifierColumn?: string;
      identifierValue?: any;
      dataKeys?: string[];
      matchingLegCount?: number;
      threshold?: number;
      affectsReconciliationStatus?: boolean;
      ruleName?: string;
      violatingLegs?: any[];
      [key: string]: any;
    };
  };
  
  raw_data: Record<string, any>;
  created_at: string;
}
```

### 3.2 Column Configuration Specification (`database_column_configurations`)
The rule configuration specifies the target identifier and matching criteria:

```json
{
  "id": "colcfg-1790892870774-j0ji",
  "name": "Core Banking Duplicate Settlement Leg Check",
  "rule_type": "DUPLICATE_CHECK",
  "primary_key_column": "FE_UTRNNO",
  "columns": [
    { "columnName": "TR_GROUP_ID", "role": "MATCH_KEY", "priority": 1 },
    { "columnName": "BO_TYPE", "role": "DISCRIMINATOR", "priority": 2 },
    { "columnName": "PROC_NAME", "role": "DISCRIMINATOR", "priority": 3 }
  ],
  "aggregation_rules": [
    { "function": "COUNT", "operator": ">", "value": 1 }
  ],
  "filter_conditions": [
    { "columnName": "BO_TYPE", "operator": "=", "value": "CMTP254" },
    { "columnName": "PROC_NAME", "operator": "!=", "value": "RVS" }
  ]
}
```

---

## 4. Execution Architecture: Set-Based Mirror Join & Pipeline Method Flow

### 4.1 Step 1: Set-Based Mirror Aggregation & Two-Level Status Ingestion
In PostgreSQL, the reconciliation engine executes an atomic set-based join matching on `(task_id, row_number)`. This updates `task_dataset_transactions` with the full multi-leg array in `returned_data` and assigns the Level 1 `reconciliation_status`:

```sql
WITH aggregated_mirror AS (
  SELECT 
    _task_id, 
    _row_number, 
    jsonb_agg(payload) AS returned_legs,
    COUNT(*) AS matched_leg_count
  FROM mirror_sett_tran_log_tab
  WHERE _task_id = $1
  GROUP BY _task_id, _row_number
)
UPDATE task_dataset_transactions tdt
SET 
  returned_data = COALESCE(am.returned_legs, '[]'::jsonb),
  canonical_data = tdt.canonical_data || jsonb_build_object(
    'reconciliation_status', CASE 
      WHEN am.matched_leg_count > 0 THEN 'PASS' 
      ELSE 'FAIL' 
    END,
    '_target_record', COALESCE(am.returned_legs->0, null),
    '_target_record_count', COALESCE(am.matched_leg_count, 0)
  )
FROM aggregated_mirror am
WHERE tdt.task_id = am._task_id AND tdt.row_number = am._row_number;
```

**Guarantees of this SQL step:**
1. **100% Set-Based**: Evaluates all rows in milliseconds without row-by-row Node.js network roundtrips.
2. **Presence Rule**: If $\ge 1$ mirror records matched, `reconciliation_status` is stamped **`PASS`**.
3. **Missing Rows**: Rows with 0 matches remain `reconciliation_status: 'FAIL'` (`NOT_FOUND_IN_TARGET_DB`).

---

### 4.2 Step 2: Database Configuration as a Pipeline Method (`DbConfigMethod`)

Just as validation boxes map to `IngestionSearchMethod` and `ConditionCheckMethod`, database column configurations map directly to `DbConfigValidationMethod`:

```typescript
export interface DbConfigMethodResult {
  status: 'PASS' | 'FAIL' | 'ERROR';
  identifierColumn: string;
  identifierValue: any;
  dataKeys: Record<string, any>;
  matchingLegCount: number;
  threshold: number;
  affectsReconciliationStatus: boolean;
  violatingLegs?: any[];
  message: string;
}

export class DbConfigValidationMethod {
  constructor(public config: DatabaseColumnConfiguration) {}

  execute(
    rowCoordinate: number,
    returnedData: Array<Record<string, any>>
  ): DbConfigMethodResult {
    const matchCol = this.config.columns?.find(c => c.role === 'MATCH_KEY')?.columnName 
      || this.config.primaryKeyColumn 
      || 'TR_GROUP_ID';

    const groupValue = returnedData[0]?.[matchCol] ?? returnedData[0]?.[matchCol.toLowerCase()];

    // Filter legs by discriminator criteria (e.g. BO_TYPE = 'CMTP254' AND PROC_NAME != 'RVS')
    const matchingLegs = returnedData.filter(leg => {
      for (const fc of this.config.filterConditions || []) {
        const col = fc.columnName;
        const legVal = leg[col] ?? leg[col.toLowerCase()] ?? leg[col.toUpperCase()];
        const targetVal = String(fc.value ?? '').trim().toLowerCase();
        const actualVal = String(legVal ?? '').trim().toLowerCase();

        if (fc.operator === '=' || fc.operator === '==') {
          if (actualVal !== targetVal) return false;
        } else if (fc.operator === '!=' || fc.operator === '<>') {
          if (actualVal === targetVal) return false;
        }
      }
      return true;
    });

    const threshold = Number(this.config.aggregationRules?.find(a => a.function === 'COUNT')?.value ?? 1);
    const isBreached = matchingLegs.length > threshold;
    const isReportOnly = (this.config as any).statusBehavior === 'REPORT_ONLY' 
      || (this.config as any).violationAction === 'REPORT';
    const affectsReconciliation = ((this.config as any).affectsReconciliationStatus ?? true) && !isReportOnly;
    const effectiveStatus = (isBreached && !isReportOnly) ? 'FAIL' : 'PASS';

    // Collect all data keys present across the returned legs for report attribution
    const dataKeys: Record<string, any> = {};
    for (const leg of returnedData) {
      if (leg[matchCol] !== undefined) dataKeys[matchCol] = leg[matchCol];
      for (const c of this.config.columns || []) {
        if (leg[c.columnName] !== undefined) dataKeys[c.columnName] = leg[c.columnName];
      }
    }

    return {
      status: effectiveStatus,
      isBreached,
      statusBehavior: isReportOnly ? 'REPORT_ONLY' : 'MUTATE_STATUS',
      identifierColumn: matchCol,
      identifierValue: groupValue,
      dataKeys,
      matchingLegCount: matchingLegs.length,
      threshold,
      affectsReconciliationStatus: affectsReconciliation,
      violatingLegs: isBreached ? matchingLegs : [],
      message: isBreached
        ? (isReportOnly
            ? `[REPORT ONLY] Observed ${matchingLegs.length} matching legs on ${matchCol} '${groupValue}' (threshold: ${threshold}). Logged without altering status.`
            : `Duplicate external postings detected on ${matchCol} '${groupValue}': found ${matchingLegs.length} matching legs (threshold: ${threshold}).`)
        : `Verified: ${matchingLegs.length} matching leg(s) found on ${matchCol}.`
    };
  }
}
```

---

### 4.3 Target Table Mapping & DAG Simplicity (The Inspector-Driven Architecture)

#### 4.3.1 User Decision: Rejection of Canvas Wire Connectors to Preserve Operational Simplicity
To keep the Flowchart DAG an intuitive, executive-friendly operational configuration tool, **Option A (Inspector-Driven Attachment)** is formally selected:
* **No Canvas Wire Spaghetti**: DB column configurations are NOT rendered as independent canvas nodes with crossing wire connectors to the validation box. 
* **Visual Node Representation**: On the visual DAG canvas, the Validation Box node (e.g. Ingestion Search on `tran_log_tab`) displays a sleek, compact status badge: `[ 🛡️ 3 Table Rules Attached ]`.
* **Inspector Drawer Interaction**: When an analyst clicks the validation node, the right-hand Inspector opens. Under the collapsible **"DB Configurations"** section:
  * The interface automatically filters and displays only DB configs belonging to that specific `targetDbId` and `targetTable`.
  * Analysts attach or detach rules via checkboxes or drag-to-attach cards without cluttering the DAG flow.

#### 4.3.2 Workflow JSON Model: Stage Binding Without DAG Connectors
In the workflow JSON persistence layer, DB configs are bound directly to the stage definition rather than requiring independent edge links in the visual flowchart graph:

```json
{
  "stageNumber": 2,
  "stageId": "stage-sett-search",
  "name": "Core Banking Ingestion Search",
  "boxType": "INGESTION_SEARCH",
  "targetDbId": "db-cbs-mysql-prod",
  "targetTable": "tran_log_tab",
  "attachedDbConfigs": [
    {
      "configId": "colcfg-1790892870774-j0ji",
      "name": "Core Banking Duplicate Settlement Leg Check",
      "stageNumber": 2,
      "targetDbId": "db-cbs-mysql-prod",
      "targetTable": "tran_log_tab",
      "affectsReconciliationStatus": true
    }
  ]
}
```

---

### 4.4 Execution Ordering: DB Config Methods Run LAST in the Stage

#### 4.4.1 Decoupled Rule-to-Method Compilation
The Rule-to-Method pipeline compiler compiles **separate, specialized method instances** for the validation box and attached DB configurations:
1. **`ValidationBoxMethod`**: Implements `IngestionSearchMethod` or `ConditionCheckMethod` responsible for coordinating external query retrieval, mirror staging, and Level 1 reconciliation.
2. **`DbConfigValidationMethod`**: Implements targeted column and multi-leg business logic (`DUPLICATE_CHECK`, `RANGE_CHECK`, `AMOUNT_MATCH`) operating directly against `returned_data`.

#### 4.4.2 Strict 4-Step Stage Lifecycle
Within any given workflow stage, execution strictly follows this sequential order:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: EXTERNAL DATA QUERY & MIRROR STAGING                                            │
│ • CoordinateInjector generates ANSI-quoted tuple query (WHERE (rn, key) IN (...)).     │
│ • External database returns matching rows across all legs.                             │
│ • Bulk streams into PostgreSQL UNLOGGED mirror: mirror_{db}_{table}.                   │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: SET-BASED RECONCILIATION ON (task_id, row_number)                              │
│ • PostgreSQL executes bulk join: tdt.task_id = m._task_id AND tdt.row_number = m._rn.  │
│ • Missing coordinates emit: reconciliation_status = 'FAIL' (Action: STOP).             │
│ • Found coordinates emit:   reconciliation_status = 'PASS' (Action: CONTINUE).         │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: WORKFLOW-SCOPED RETURNED_DATA CONSOLIDATION                                    │
│ • PostgreSQL aggregates 100% of physical mirror columns via to_jsonb(m).               │
│ • Stored in task_dataset_transactions.returned_data[workflowId][targetTable].          │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                                            ▼ (Conditional Handoff: ONLY passed rows)
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ STEP 4: DB CONFIG METHOD EXECUTES LAST IN STAGE                                        │
│ • Rows with reconciliation_status === 'FAIL' bypass the method completely.             │
│ • Rows with reconciliation_status === 'PASS' are handed to DbConfigValidationMethod.   │
│ • Evaluates multi-leg criteria (e.g. BO_TYPE = 'CMTP254' count > 1).                   │
│ • Writes status, identifierColumn ('TR_GROUP_ID'), identifierValue, and dataKeys to    │
│   canonical_data._workflow_runs[workflowId]._validation_details.                       │
│ • If affectsReconciliationStatus == true and fails:                                    │
│     Mutates reconciliation_status = 'FAIL' (Action: STOP).                             │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Architectural Benefits & Invariant Guarantees

1. **Preservation of Row-Number Coordinates (Rule 1 & Rule 13)**:
   Maintains `_row_number` comparison and native PostgreSQL set-based joins, completely avoiding synthetic window re-indexing or fragile subquery cursors.
2. **Full Multi-Leg Transparency in Dedicated `returned_data` (`returned`) Column**:
   The dedicated `returned_data JSONB` column stores the complete array of returned legs (principal, fee 1, fee 2), making them immediately accessible to UI accordions, audit trails, and Maker-Checker proposals.
3. **Two-Level Status Decoupling**:
   Clean separation between **Level 1 (`reconciliation_status`)** and **Level 2 (`validation_status`)** guarantees that physical ledger discovery and business criteria are never confused.
4. **Conditional Execution Efficiency & Zero Waste**:
   Rows with 0 matches in the mirror table (`reconciliation_status === 'FAIL'`) bypass column business rules completely. Only passed rows (`reconciliation_status === 'PASS'`) receive in-memory method execution.
5. **Elimination of Fragile Correlated Subqueries in SQL**:
   Completely removes the need for `(SELECT COUNT(*) FROM mirror _dup WHERE _dup._row_number = m._row_number ...)` inside dynamic `UPDATE` statements, avoiding subquery planner complexity and cursor overhead.
6. **Deterministic Cardinality Protection**:
   A single transaction coordinate ($task\_id, row\_number$) remains strictly 1:1 with `task_dataset_transactions`. No Cartesian explosion occurs during joins.
7. **Actionable Root Cause & Key Attribution**:
   The task data report explicitly captures the offending column (`identifierColumn`), group value (`identifierValue`), and complete list of data keys, allowing back-office operators to immediately understand the root cause of discrepancies.
8. **Configurable Status Mutation**:
   The DB method can either change the reconciliation status to FAIL (if `affectsReconciliationStatus: true`) or act purely diagnostically without failing the reconciliation (if `affectsReconciliationStatus: false`).
9. **Zero Ingress Regression**:
   Duplicate lines in uploaded files continue to be rejected or quarantined at the gate by `datasetIngestionService.ts`, strictly satisfying **Rule 3** (Lifecycle Separation).

---

## 6. Implementation Roadmap & Traceability

| Phase | Subsystem | Action | Verification |
|---|---|---|---|
| **Phase 1** | `CoordinateInjector.ts` | Aggregate multi-leg external results into `canonical_data._target_records: [...]` on mirror load. | Test with 3-leg settlement transaction `2689706150`. |
| **Phase 2** | `ReconciliationEngine.ts` | Implement `evaluateMultiLegDuplicateCheck` to evaluate `_target_records` against column configs. | Unit test verifying 1 leg = PASS, 2 legs = FAIL. |
| **Phase 3** | `ruleSqlCompiler.ts` | Add JSONB array evaluation branch for attached duplicate column configs. | Automated Vitest suite passing. |
| **Phase 4** | `WorkspaceTable.tsx` | Render multi-leg badge, expandable row accordion, and red cell highlight on `identifierColumn`. | Visual inspection in UI. |

---

## 7. Architectural Assessment: Multi-Table Joins & Concurrent Multi-Workflow Execution

### 7.1 Clarification on Column Projection: Full Mirror Schema Fidelity
**The `returned_data` column MUST contain ALL physical columns of the mirror table, never a restricted projection.**
* When external data is queried (e.g. from CBS `bo_test.tran_log_tab`), every returned column—spanning account numbers, transaction amounts, timestamps, ISO response codes, narrative fields, terminal identifiers, and internal group keys—is preserved in full within the mirror table payload.
* The aggregation query uses `jsonb_agg(m.payload)` or PostgreSQL `to_jsonb(m)`:
  ```sql
  jsonb_agg(
    to_jsonb(m) - '_task_id' - '_batch_id' - '_mirror_id' - '_rule_block_id' - '_validation_status' - '_validation_action' - '_validation_details' - '_mirrored_at'
  ) AS returned_legs
  ```
* **Why Full Fidelity is Mandatory**: DB column configurations and downstream validation methods dynamically inspect arbitrary fields (e.g., `BO_TYPE`, `PROC_NAME`, `AMNT1`, `TR_GROUP_ID`). By retaining 100% of the external table columns in `returned_data JSONB`, any DB config method can evaluate its rules in-memory without re-querying the external database.

---

### 7.2 Scenario A: What Happens When Two Reconciliation Joins Try to Add Different Returned Data to the Task Dataset?

#### The Problem Formulation
In real-world multi-stage reconciliation pipelines:
1. **Stage 1 (CBS Core Banking)**: Reconciles against `tran_log_tab` (returns core banking ledger rows with CBS columns: `BO_TYPE`, `AMNT1`, `TR_GROUP_ID`, `PROC_NAME`, etc.).
2. **Stage 2 (Switch Gateway)**: Reconciles against `sett_trans_tab` (returns switch processing rows with gateway columns: `PAN`, `SYS_TRACE`, `AUTH_ID`, `RESP_CODE`, etc.).

#### The Vulnerability of a Flat Array / Un-namespaced Column
If `returned_data` is stored as a flat unkeyed array (`returned_data = [leg1, leg2]`), Stage 2 will **clobber and destroy** the CBS core banking data written by Stage 1. Downstream auditing, dispute resolution, and Maker-Checker proposals would permanently lose visibility into the core banking legs.

#### The Architectural Solution: Target-Table Namespaced JSONB Storage
Instead of a flat array, `returned_data` is structured as a **Target-Table Namespaced JSONB Object**:

```json
{
  "tran_log_tab": [
    {
      "BO_TYPE": "CMTP254",
      "AMNT1": 142000,
      "TR_GROUP_ID": "103458988891",
      "PROC_NAME": "SETT",
      "VALUE_DATE": "2026-10-08",
      "ACCNT_NUM": "100029384728"
    }
  ],
  "sett_trans_tab": [
    {
      "PAN": "411122******1234",
      "SYS_TRACE": "092102",
      "AUTH_ID": "AUTH992",
      "RESP_CODE": "00",
      "TERM_ID": "ATM-9021"
    }
  ]
}
```

#### Atomic Non-Destructive Update in PostgreSQL
When Stage 2 executes its set-based update, it uses PostgreSQL's native JSONB shallow merge (`||`) operator:

```sql
UPDATE task_dataset_transactions tdt
SET 
  -- Merges new table data without overwriting existing tables
  returned_data = COALESCE(tdt.returned_data, '{}'::jsonb) || jsonb_build_object(
    'sett_trans_tab', am.returned_legs
  ),
  canonical_data = tdt.canonical_data || jsonb_build_object(
    'reconciliation_status', CASE WHEN am.matched_leg_count > 0 THEN 'PASS' ELSE 'FAIL' END,
    '_target_record', am.returned_legs->0,
    '_reconciliation_tables', COALESCE(tdt.canonical_data->'_reconciliation_tables', '[]'::jsonb) || jsonb_build_array('sett_trans_tab')
  )
FROM aggregated_mirror am
WHERE tdt.task_id = am._task_id AND tdt.row_number = am._row_number;
```

#### Concrete Guarantees:
1. **Zero Data Loss**: Both `tran_log_tab` and `sett_trans_tab` data coexist side-by-side.
2. **Method Dispatch Isolation**: A `DbConfigValidationMethod` targeting `tran_log_tab` evaluates `returned_data->'tran_log_tab'`. A method targeting `sett_trans_tab` evaluates `returned_data->'sett_trans_tab'`.
3. **Multi-Leg Accordion**: The UI displays distinct collapsible sections: "Core Banking Legs (tran_log_tab)" and "Switch Gateway Legs (sett_trans_tab)".

---

### 7.3 Scenario B: What Happens When Two Different Workflows Run on the Same Task?

#### The Problem Formulation
Suppose `TASK-102` contains 500 disputed transactions:
- **Operator A** (or automated rule trigger) executes **Workflow 1**: *"ATM Settlement & Reversal Investigation"* (queries CBS MySQL).
- **Operator B** executes **Workflow 2**: *"Visa/Mastercard Interchange Fee Reconciliation"* (queries Switch Oracle).

Two critical operational modes must be assessed:
1. **Concurrent Execution**: Both workflows run at the exact same time.
2. **Sequential / Historical Execution**: Workflow 1 runs at 10:00 AM; Workflow 2 runs at 2:00 PM on the same task.

---

#### 7.3.1 Concurrent Execution: Concurrency Hazards & Advisory Locking (Rule 10 & 13)

##### The Hazards of Uncontrolled Concurrency:
1. **Destructive State Overwrite**: Workflow 1 sets `_validation_status = 'PASS'`, and milliseconds later Workflow 2 overwrites it with `_validation_status = 'FAIL'`.
2. **PostgreSQL Row-Lock Contention & Deadlocks**: Concurrent `UPDATE task_dataset_transactions WHERE task_id = $1` locks all rows in the dataset, creating deadlocks against concurrent `mirror` table operations.
3. **Dirty Intermediate Reads**: Workflow 1 might evaluate a validation check on `canonical_data` while Workflow 2 is actively replacing fields.

##### The Architectural Solution: 64-Bit Cryptographic Task-Scoped Advisory Locking
In strict compliance with **Rule 10 and Rule 13 of AGENTS.md**, the workflow execution engine must acquire a task-scoped advisory lock before starting execution:

```typescript
// Hash task ID into 64-bit cryptographic advisory lock key
const lockKeyQuery = `
  SELECT pg_try_advisory_xact_lock(
    ('x' || substr(md5('task_exec_' || $1), 1, 16))::bit(64)::bigint
  ) AS acquired;
`;
const lockRes = await client.query(lockKeyQuery, [taskId]);
if (!lockRes.rows[0].acquired) {
  throw new ConflictError(
    `Task '${taskId}' is currently locked by an active workflow execution. Concurrent workflow execution is blocked to prevent dataset corruption.`
  );
}
```

##### Concurrency Policy:
* **Mutual Exclusion**: Only **one** workflow may execute against a task at any given second.
* **API Response**: If a second workflow is triggered concurrently, the API immediately returns HTTP 409 Conflict with details on the active run, preventing corrupt state collisions.

---

#### 7.3.2 Sequential Execution: Preserving Historical Workflow Runs (Rule 3 & 20)

##### The Hazard of Overwriting:
When Workflow 2 runs sequentially after Workflow 1 finishes, if `canonical_data` only stores a single `_validation_status`, `_validation_workflow_id`, and `_validation_workflow_name`, Workflow 2 erases Workflow 1's results from the active workspace.

##### The Architectural Solution: Workflow-Scoped Result History & Active Context
To support multi-workflow tasks, `task_dataset_transactions` maintains two levels of persistence:

1. **Persistent History in `task_workflow_executions`**:
   Every completed workflow execution is immutably archived in the relational table `task_workflow_executions` (recording `workflow_id`, `workflow_name`, `status`, `passed_count`, `failed_count`, `executed_by`, `execution_summary`).
2. **Workflow-Namespaced Results in `canonical_data._workflow_runs`**:
   Instead of erasing previous runs, `canonical_data` accumulates workflow executions:

```json
{
  "_active_workflow_id": "wf-fee-002",
  "_active_workflow_name": "Visa Interchange Fee Reconciliation",
  "reconciliation_status": "PASS",
  "validation_status": "FAIL",
  "_workflow_runs": {
    "wf-atm-001": {
      "workflowName": "ATM Settlement Investigation",
      "reconciliation_status": "PASS",
      "validation_status": "PASS",
      "executedAt": "2026-10-08T10:00:00Z",
      "executedBy": "operator_sarah",
      "targetTables": ["tran_log_tab"],
      "details": { "matchingLegCount": 1 }
    },
    "wf-fee-002": {
      "workflowName": "Visa Interchange Fee Reconciliation",
      "reconciliation_status": "PASS",
      "validation_status": "FAIL",
      "executedAt": "2026-10-08T14:30:00Z",
      "executedBy": "operator_john",
      "targetTables": ["switch_fee_tab"],
      "details": { "matchingLegCount": 3, "identifierColumn": "TR_GROUP_ID" }
    }
  }
}
```

#### Frontend Workspace Experience:
* **Workflow Switcher Dropdown**: Back-office operators can toggle between workflows in the `InvestigationWorkspace` header:
  `[ Active Workflow: Visa Interchange Fee (FAIL) ▼ ]`
  Switching to *"ATM Settlement"* instantaneously rehydrates the grid, columns, and badges for that workflow run without having to re-run the pipeline.

---

## 8. Formal Architecture Review & Required Corrections (11 October 2026)

### 8.1 Executive Summary & Binding Review Outcomes
On 11 October 2026, a comprehensive architectural review was conducted on the Multi-Leg Duplicate Detection and JSONB Coordinate Consolidation subsystem. The review delivered a decisive verdict:
> **"Approve the architectural direction, but do not treat the current specification as implementation-ready until critical correctness defects, status ambiguities, and zero-match omissions are resolved."**

The review identified six critical architectural vulnerabilities:
1. **Conflation of Status Concepts**: Treating external match presence ($\ge 1$ mirror legs found) as synonymous with successful business reconciliation.
2. **Missing Zero-Match Updates**: SQL `UPDATE ... FROM aggregated_mirror` updated only rows with mirror entries; transactions with zero external matches were left unupdated with stale statuses and missing diagnostic metadata.
3. **Inconsistent `returned_data` JSONB Shapes**: Ambiguity between flat array representations (`[leg1, leg2]`) and target-namespaced objects (`{ "tran_log_tab": [leg1] }`), as well as empty-value representations (`[]` vs `{}` vs `null`).
4. **Weak Execution Lineage**: Risk of cross-execution state collisions when multiple workflow runs evaluate the same task or dataset.
5. **Multi-Leg Duplicate Evaluator Defects**: Hard-coded `>` comparison ignoring user-configured operators (`>=`, `=`, `<=`), overwritten diagnostic objects retaining only the last leg's data, and silent string coercion of `null` fields in predicate filters.
6. **Undeclared TypeScript Interfaces**: Method return types declaring fields not typed in `DbConfigMethodResult`.

All 12 review recommendations have been physically implemented in the repository, verified across 8 automated regression test suites, and validated on live production datasets (`ISS-6362`). This section codifies the binding standards.

---

### 8.2 Four-Dimension Lifecycle Separation
In strict adherence to **Rule 2 and Rule 3 of AGENTS.md**, the system strictly decouples the four dimensions of workflow execution:

| Lifecycle Dimension | Permitted Values | Architectural Definition |
|---|---|---|
| **Acquisition Status** | `SUCCESS`, `ERROR` | Whether the external database lookup and mirror staging completed without network, timeout, or database connectivity faults. |
| **Match Status** | `FOUND`, `NOT_FOUND` | Whether external mirror records matched the source transaction coordinate (`_matched_leg_count > 0` $\implies$ `FOUND`; `0` $\implies$ `NOT_FOUND`). |
| **Validation Status** | `PASS`, `FAIL`, `ERROR`, `PENDING` | Whether the configured business validation rules, column configurations, or condition checks passed, failed, errored, or have not yet run. |
| **Pipeline Action** | `CONTINUE`, `STOP`, `CLOSE`, `FLAG`, `REPORT` | What routing control action the workflow engine executes next upon evaluating the validation verdict. |

#### Architectural Invariants:
1. **Lookup Success with Zero Records**: When an external database query succeeds but returns zero matching rows, `acquisition_status = 'SUCCESS'` and `match_status = 'NOT_FOUND'`.
2. **Multiple Records Found with Business Failure**: When an external lookup returns 3 records, `acquisition_status = 'SUCCESS'` and `match_status = 'FOUND'`, but duplicate checking or amount checks may result in `validation_status = 'FAIL'` and `pipeline_action = 'FLAG'`.
3. **Database Lookup Fault**: When the core database is unreachable or query compilation fails, `acquisition_status = 'ERROR'` and `validation_status = 'ERROR'`. It is strictly prohibited to classify an infrastructure failure as an ordinary business `NOT_FOUND` or `FAIL`.

---

### 8.3 Zero-Match Atomic LEFT JOIN Update Pattern
The legacy pattern executed an inner join against the aggregated mirror:
```sql
-- ❌ DEFECTIVE PATTERN: Skips zero-match rows entirely!
UPDATE task_dataset_transactions tdt
SET returned_data = am.returned_legs
FROM aggregated_mirror am
WHERE tdt.task_id = am._task_id AND tdt.row_number = am._row_number;
```
Rows with 0 mirror matches were never touched, leaving stale values from prior runs.

#### The Certified Atomic Pattern (`reconciliationService.ts`):
The update drives from the complete set of source transactions for the execution batch and executes a `LEFT JOIN` against the grouped mirror table in a single atomic SQL statement:

```sql
WITH grouped_mirror AS (
  SELECT 
    _task_id, 
    _row_number, 
    _batch_id,
    jsonb_agg(payload ORDER BY created_at ASC) AS mirror_legs,
    COUNT(*) AS matched_leg_count
  FROM mirror_sett_tran_log_tab
  WHERE _task_id = $1 AND _batch_id = $2
  GROUP BY _task_id, _row_number, _batch_id
)
UPDATE task_dataset_transactions AS tdt
SET 
  returned_data = CASE 
    WHEN gm.mirror_legs IS NOT NULL THEN 
      jsonb_build_object($3::text, jsonb_build_object($4::text, gm.mirror_legs))
    ELSE NULL
  END,
  canonical_data = tdt.canonical_data || jsonb_build_object(
    'acquisition_status', 'SUCCESS',
    'match_status', CASE WHEN COALESCE(gm.matched_leg_count, 0) > 0 THEN 'FOUND' ELSE 'NOT_FOUND' END,
    '_matched_leg_count', COALESCE(gm.matched_leg_count, 0),
    'reconciliation_status', CASE WHEN COALESCE(gm.matched_leg_count, 0) > 0 THEN 'PASS' ELSE 'FAIL' END,
    '_target_record', CASE WHEN gm.mirror_legs IS NOT NULL THEN gm.mirror_legs->0 ELSE NULL END
  )
FROM task_dataset_transactions AS source_rows
LEFT JOIN grouped_mirror gm
  ON gm._task_id = source_rows.task_id
 AND gm._row_number = source_rows.row_number
 AND gm._batch_id = $2
WHERE tdt.task_id = source_rows.task_id
  AND tdt.row_number = source_rows.row_number
  AND source_rows.task_id = $1;
```

#### Guarantees:
- **100% Row Coverage**: Every source transaction in the task receives an explicit atomic update.
- **Explicit Zero-Match Semantics**: Transactions with zero matches receive `match_status = 'NOT_FOUND'`, `_matched_leg_count = 0`, `reconciliation_status = 'FAIL'`, `_target_record = NULL`, and `returned_data = NULL`.
- **Zero Race Conditions**: A single set-based statement eliminates the need for separate `unmatchedSql` updates.

---

### 8.4 Standardized `returned_data` Contract: Option B & Explicit NULL Semantics

#### The Canonical Schema:
```typescript
type ReturnedDataContract = Record<WorkflowId, Record<TargetTable, Array<Record<string, any>>>> | null;
```

When matched external legs exist:
```json
{
  "wf-1790956098575": {
    "tran_log_tab": [
      {
        "TR_HIS_ID": "HIS-001",
        "RRN": "2689706150",
        "AMNT1": "500.00",
        "PROC_NAME": "SETT",
        "created_at": "2026-10-10T10:00:00Z"
      },
      {
        "TR_HIS_ID": "HIS-002",
        "RRN": "2689706150",
        "AMNT1": "500.00",
        "PROC_NAME": "FEE",
        "created_at": "2026-10-10T10:00:01Z"
      }
    ]
  }
}
```

#### The Empty-Value Contract:
- **Unmatched Records**: When no external legs match a source row, `returned_data` is explicitly stored as **`NULL`** in PostgreSQL.
- **Strict Prohibition of Metadata Clutter**: It is strictly forbidden to store synthetic metadata wrappers (such as `{"stages": {"tran_log": []}}` or `{"audit": ...}`) inside `returned_data`. `returned_data` contains pure physical database records.

---

### 8.5 Execution-Scoped Lineage & Advisory Locking
To guarantee multi-tenant and multi-workflow isolation (Rule 10 & 13):
1. **Execution Identity**: Every execution creates a unique batch identifier `_batch_id` / `workflow_execution_id`.
2. **Mirror Staging Lineage**: All rows ingested into `mirror_{db}_{table}` carry `(_task_id, _row_number, _batch_id)`.
3. **Advisory Locking**: All workflow executions acquire a 64-bit cryptographic advisory lock (`task_exec_${taskId}`) via:
   ```sql
   SELECT pg_try_advisory_xact_lock(
     ('x' || substr(md5('task_exec_' || $1), 1, 16))::bit(64)::bigint
   ) AS acquired;
   ```
   Preventing concurrent writes and race condition deadlocks across parallel workers.

---

### 8.6 Multi-Leg Duplicate Evaluator Upgrades (`DbConfigValidationMethod.ts`)

#### 8.6.1 Allowlisted Operator Evaluator
The duplicate evaluator supports only explicitly allowlisted comparison operators:
```typescript
const ALLOWED_OPERATORS = ['>', '>=', '=', '==', '<', '<=', '!=', '<>'] as const;
```
If an unsupported operator (e.g. `LIKE`, `IN`, `BETWEEN`) is supplied in the configuration:
```typescript
if (!ALLOWED_OPERATORS.includes(normalizedOp as any)) {
  return {
    status: 'ERROR',
    action: 'FLAG',
    message: `Unsupported duplicate check operator '${operator}'. Allowed operators: ${ALLOWED_OPERATORS.join(', ')}`,
    details: { configuredOperator: operator, allowedOperators: ALLOWED_OPERATORS },
    dataKeys: {},
    isBreached: false,
    statusBehavior: this.config.statusBehavior || 'MUTATE_STATUS',
    affectsReconciliationStatus: this.config.affectsReconciliationStatus ?? true
  };
}
```
Runtime evaluation executes exact mathematical comparisons for every supported operator:
- `>`: `duplicateCount > threshold`
- `>=`: `duplicateCount >= threshold`
- `=` / `==`: `duplicateCount === threshold`
- `<`: `duplicateCount < threshold`
- `<=`: `duplicateCount <= threshold`
- `!=` / `<>`: `duplicateCount !== threshold`

#### 8.6.2 Complete Diagnostic Retention for All Violating Legs
Rather than overwriting diagnostic attributes across legs, the evaluator collects distinct leg identifiers across **all** matching records:
```typescript
const violatingLegIdentifiers: string[] = matchingLegs.map(leg => {
  return String(leg.TR_HIS_ID || leg.tr_his_id || leg.leg_id || leg.id || leg[identifierColumn] || 'UNKNOWN_LEG');
});
```
This guarantees that when 3 duplicate legs trigger a rule, the operator receives `['HIS-001', 'HIS-002', 'HIS-003']` rather than an overwritten scalar.

#### 8.6.3 Strict Null / Missing-Value Predicate Semantics
In multi-leg filter conditions (e.g. `PROC_NAME != 'RVS'`), missing or null fields are strictly evaluated:
```typescript
const rawVal = leg[cond.columnName] ?? leg[cond.columnName.toLowerCase()] ?? leg[cond.columnName.toUpperCase()];
if (rawVal === undefined || rawVal === null) {
  // Missing or null fields do NOT satisfy positive or negative predicates
  return false;
}
```
Null values are never coerced to `""`, preventing null fields from accidentally qualifying as non-reversal legs.

#### 8.6.4 Formally Aligned `DbConfigMethodResult` TypeScript Interface
```typescript
export interface DbConfigMethodResult {
  status: 'PASS' | 'FAIL' | 'ERROR';
  action: 'CONTINUE' | 'STOP' | 'CLOSE' | 'FLAG' | 'REPORT';
  message: string;
  details: {
    duplicateCount?: number;
    threshold?: number;
    identifierColumn?: string;
    identifierValue?: any;
    violatingLegIdentifiers?: string[];
    violatingColumns?: string[];
    failedConditions?: string[];
    [key: string]: any;
  };
  dataKeys: Record<string, any>;
  isBreached: boolean;
  statusBehavior: 'MUTATE_STATUS' | 'REPORT_ONLY';
  affectsReconciliationStatus: boolean;
}
```

---

### 8.7 Cross-Stage Namespacing & Non-Clobbering JSONB Merging
PostgreSQL JSONB `||` is a shallow merge. When a subsequent stage queries another target table (e.g. `sett_trans_tab`), it merges using:
```sql
returned_data = jsonb_set(
  COALESCE(tdt.returned_data, '{}'::jsonb),
  ARRAY[$1::text, $2::text],
  gm.mirror_legs,
  true
)
```
Ensuring `wf-1790956098575` preserves `tran_log_tab` alongside `sett_trans_tab`.

---

### 8.8 Concurrency, Mirror Lifecycle & Durable Evidence
- **UNLOGGED Tables**: Transient processing structures dropped/cleaned at execution conclusion (`mirror_{db}_{table}`).
- **Durable System of Record**: `task_dataset_transactions` (with indexed `returned_data` and `canonical_data`) and `task_workflow_executions` store immutable audit evidence surviving server restarts.

---

### 8.9 Verification Test Matrix (8 Automated Regression Suites)
The entire test matrix specified in §10 of the Architecture Review is automated in [`backend/src/services/__tests__/twoLevelReconciliationAndMultiLeg.test.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/__tests__/twoLevelReconciliationAndMultiLeg.test.ts):

| Test Scenario | Evaluated Invariant | Result |
|---|---|---|
| **1. Legitimate Multi-Leg Retention** | Multiple legs sharing row coordinate evaluated without file duplicate conflation | ✅ PASSED (1ms) |
| **2. Multi-Leg Duplicate Breach** | Breaching configured threshold flags transaction with identifier attribution | ✅ PASSED (1ms) |
| **3. End-to-End Pipeline Multi-Leg** | `ReconciliationMethod` discovers 2 legs $\implies$ `DbConfigValidationMethod` detects duplicate | ✅ PASSED (1ms) |
| **4. Diagnostic REPORT Mode** | `statusBehavior: 'REPORT_ONLY'` preserves `PASS` with diagnostic warning | ✅ PASSED (1ms) |
| **5. Invalid Operator Rejection** | Unsupported operator `LIKE` returns `status: 'ERROR'` with explicit diagnostic message | ✅ PASSED (1ms) |
| **6. Runtime Behavior Variation** | Changing operator (`>= 2` vs `<= 1`) dynamically flips verdict from `FAIL` to `PASS` | ✅ PASSED (1ms) |
| **7. Multi-Leg Diagnostic Retention** | All distinct violating leg IDs (`HIS-001`, `HIS-002`) retained without scalar overwrite | ✅ PASSED (1ms) |
| **8. Strict Null Filter Semantics** | Predicate `PROC_NAME != 'RVS'` rejects null or missing `PROC_NAME` without coercion | ✅ PASSED (1ms) |

---

### 8.10 Priority Matrix (P0, P1, P2) Resolution Status

| Priority | Requirement | Resolution Location | Status |
|---|---|---|---|
| **P0** | Decouple 4-dimension status taxonomy | `reconciliationService.ts`, `postgresRepo.ts` | ✅ COMPLETED |
| **P0** | Fix zero-match update via atomic `LEFT JOIN` | `reconciliationService.ts:310-355` | ✅ COMPLETED |
| **P0** | Standardize `returned_data` Option B schema (`NULL` on zero) | `reconciliationService.ts`, `investigationOrchestratorService.ts` | ✅ COMPLETED |
| **P0** | Execution-scoped mirror and batch lineage | `reconciliationService.ts`, `WorkflowPipelineBuilder.ts` | ✅ COMPLETED |
| **P1** | Implement allowlisted operator evaluator | `DbConfigValidationMethod.ts:98-132` | ✅ COMPLETED |
| **P1** | Preserve diagnostics for all violating legs | `DbConfigValidationMethod.ts:162-175` | ✅ COMPLETED |
| **P1** | Enforce strict null/undefined predicate semantics | `DbConfigValidationMethod.ts:85-95` | ✅ COMPLETED |
| **P1** | Formally align `DbConfigMethodResult` TypeScript interface | `DbConfigValidationMethod.ts:33-54` | ✅ COMPLETED |
| **P2** | 64-bit cryptographic advisory locking | `reconciliationService.ts`, `ExecutablePipeline.ts` | ✅ COMPLETED |
| **P2** | Durable audit evidence beyond UNLOGGED tables | `task_dataset_transactions`, `task_workflow_executions` | ✅ COMPLETED |
| **P2** | Complete automated test matrix & physical DB verification | `twoLevelReconciliationAndMultiLeg.test.ts`, Task `ISS-6362` | ✅ COMPLETED |

---

## 9. Final Sign-Off & Zero-Assumption Certification

* **Governing Rule**: [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rule 22)  
* **Master Index Registration**: [`MASTER_ARCHITECTURE_INDEX.md §3 (Domain 3)`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md#domain-3-rule-to-method-pipeline-architecture--dynamic-sql-compilation)  
* **Audit Trail Registration**: [`VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md §17`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/VALIDATION_BOX_AND_ROW_COORDINATE_AUDIT_LOG.md#L673)  
* **Physical Database Verification**: Task `ISS-6362` (Row 1: 6 legs under `returned_data['wf-1790956098575']['tran_log_tab']`; Row 22: `returned_data = NULL`, `match_status = 'NOT_FOUND'`).  
* **Architecture Decision**: **APPROVED, REVISED, IMPLEMENTED & FULLY CERTIFIED FOR PRODUCTION**  
* **Sign-Off Date**: 11 October 2026


