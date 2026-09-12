# Forward Modification Plan

## Repository Analysis Summary

The current codebase is an operational workflow management platform with a PostgreSQL-backed backend and a React/Vite frontend. The runtime server starts from [backend/src/server.ts](backend/src/server.ts), mounts the Express route groups, and exposes the application over port 5002. The repository abstraction in [backend/src/store/repository.ts](backend/src/store/repository.ts) routes persistence through PostgreSQL when available, while still keeping a compatibility fallback to the legacy in-memory and MongoDB-aware model branches.

The most important implementation facts visible in the codebase are:

- PostgreSQL is the live persistent repository for workflows, validation boxes, query extraction records, and related relational metadata.
- Workflow route handling is exposed by [backend/src/routes/workflows.ts](backend/src/routes/workflows.ts).
- Validation box route handling is exposed by [backend/src/routes/validationBoxes.ts](backend/src/routes/validationBoxes.ts).
- Mirror-table provisioning and external reconciliation behavior are tied to [backend/src/services/mirrorTableManager.ts](backend/src/services/mirrorTableManager.ts).
- The workflow execution model is centered on [backend/src/services/workflowEngineSingleton.ts](backend/src/services/workflowEngineSingleton.ts).
- The application is intended to maintain a strict separation between:
  - Validation verdict (`PASS`, `FAIL`, `ERROR`, `PAUSED_DB_OFFLINE`)
  - Pipeline action (`CONTINUE`, `STOP`, `CLOSE`, `FLAG`, `REPORT`)

## Architecture Reality

The repository already aligns with the current baseline:

1. PostgreSQL is the active relational persistence layer.
2. Workflow and validation box entities live in relational tables in the migration schema.
3. Query extraction and validation box metadata use the persisted schema rather than client-only local storage.
4. External reconciliation uses UNLOGGED PostgreSQL mirror tables and batched SQL access patterns.
5. Validation result semantics and execution action semantics must stay separated in the rule engine and orchestration logic.

## Recommended Forward Modification Plan

The concrete implementation touchpoints for the proposed changes are already visible in the repository files that hold the shared architecture contract:

- Server and route composition: [backend/src/server.ts](backend/src/server.ts)
- Repository fallback and persistence selection: [backend/src/store/repository.ts](backend/src/store/repository.ts)
- Workflow API shape and stage-aware workflow creation: [backend/src/routes/workflows.ts](backend/src/routes/workflows.ts)
- Validation-box creation and mirror-table provisioning flow: [backend/src/routes/validationBoxes.ts](backend/src/routes/validationBoxes.ts)
- Database source and mapping flow: [backend/src/routes/database.ts](backend/src/routes/database.ts)
- Mirror-table lifecycle management: [backend/src/services/mirrorTableManager.ts](backend/src/services/mirrorTableManager.ts)
- Investigation/workflow orchestration and execution envelope: [backend/src/services/investigationOrchestratorService.ts](backend/src/services/investigationOrchestratorService.ts) and [backend/src/services/workflowEngineSingleton.ts](backend/src/services/workflowEngineSingleton.ts)
- Schema backing the persisted workflow objects: [backend/src/database/migrations/001_initial_schema.sql](backend/src/database/migrations/001_initial_schema.sql)

### 1. Persistence and Repository Routing Standardization

The proposed change is to bring the repository and persistence layers into a single operational model where PostgreSQL remains the source of truth for workflow metadata, validation-box metadata, query extraction metadata, and investigation objects. This should be grounded in the selection logic that spans [backend/src/store/repository.ts](backend/src/store/repository.ts), the route wrappers in [backend/src/routes/workflows.ts](backend/src/routes/workflows.ts), and the PostgreSQL metadata tables declared in [backend/src/database/migrations/001_initial_schema.sql](backend/src/database/migrations/001_initial_schema.sql). In general terms, this means reducing the ambiguity introduced by older MongoDB and in-memory fallback branches and ensuring the app consistently reads and writes through one relational contract.

### 2. Workflow and Validation-Box Contract Alignment

The proposed change is to align the business object contract that arrives through the API with the object schema expected by the stored route and repository layers. This is most visible in [backend/src/routes/workflows.ts](backend/src/routes/workflows.ts) and [backend/src/routes/validationBoxes.ts](backend/src/routes/validationBoxes.ts), where workflow stages, validation-box metadata, target database references, and target tables are translated into persisted objects. In general terms, the change is to ensure the same object meaning is passed from route input to repository output without accidental drift in naming, field placement, target source, or lifecycle semantics.

### 3. Validation Result and Pipeline Action Separation

The proposed change is to preserve the formal distinction between the verdict a rule produces and the action the workflow engine decides to take after that verdict. This distinction should be enforced through the orchestration boundary represented by the workflow engine and investigation orchestrator files, especially [backend/src/services/workflowEngineSingleton.ts](backend/src/services/workflowEngineSingleton.ts) and [backend/src/services/investigationOrchestratorService.ts](backend/src/services/investigationOrchestratorService.ts). In general terms, the change is to make a rule decide what it discovered, then let the workflow engine decide whether the business process should continue, stop, close, flag, or report.

### 4. External Source Mapping and Driver Discipline

The proposed change is to keep the external source model routed through the shared mapping and directory structure instead of allowing direct or hard-coded assumptions about database table names and columns. The exposed access path is defined in [backend/src/routes/database.ts](backend/src/routes/database.ts) and supported by the migration-backed schema. In general terms, this means enforcing a registry-driven source model where the target store is identified through metadata and then projected only through a minimal, safe column set.

### 5. Mirror-Table Lifecycle Governance

The proposed change is to treat mirror-table creation and refresh as a governed lifecycle action attached to each new or edited validation box, workflow, or data source object. The most direct implementation anchor is [backend/src/services/mirrorTableManager.ts](backend/src/services/mirrorTableManager.ts), and the route handlers in [backend/src/routes/validationBoxes.ts](backend/src/routes/validationBoxes.ts) and [backend/src/routes/database.ts](backend/src/routes/database.ts). In general terms, the change is to make the mirror layer a normal part of reconciliation delivery rather than an ad hoc side effect.

### 6. Execution Discipline and Stage Awareness

The proposed change is to keep stage-aware workflow execution disciplined across the workflow engine and the investigation orchestration context. The relevant files are [backend/src/services/workflowEngineSingleton.ts](backend/src/services/workflowEngineSingleton.ts), [backend/src/services/investigationOrchestratorService.ts](backend/src/services/investigationOrchestratorService.ts), and the workflow route payload mapping in [backend/src/routes/workflows.ts](backend/src/routes/workflows.ts). In general terms, the change is to preserve stage ordering, execution envelopes, and business meaning for each processing stage without letting workflow interpretation drift into inconsistent status handling.

### 7. Frontend and Backend Contract Synchronization

The proposed change is to keep the workflow studio and validation-box UI model aligned with the backend object schema instead of allowing separate UI-only object structure. The mapping from the workflow and validation routes to the UI-level visual objects should stay grounded in the same source files that define the operational API contract in [backend/src/routes/workflows.ts](backend/src/routes/workflows.ts) and [backend/src/routes/validationBoxes.ts](backend/src/routes/validationBoxes.ts). In general terms, this means fewer UI state mismatches, clearer schema ownership, and a cleaner path from screen configuration to persisted workflow data.

### 8. Regression Testing Around the Contract Boundary

The proposed change is to introduce a stronger test boundary that checks the app’s current canonical path using the same architectural entry points visible in the repository. The testing surface should be organized around the route files and repository files rather than around synthetic mocks. In general terms, this means proving that the PostgreSQL-backed routes and repository handler stay coherent across create, read, update, delete, and query extraction scenarios while preserving the strict verdict/action distinction.

## Recommended Execution Order

1. Repository and persistence normalization
2. Workflow and validation-box payload contract alignment
3. Verification-versus-action separation enforcement
4. Mirror-table and query extraction provisioning consistency
5. Frontend/backend schema contract harmonization
6. Regression tests and API contract coverage

## Conclusion

The strongest path forward is not replacing the architecture, but making the current PostgreSQL, workflow-studio, validation-box, and mirror-table design consistent end to end. The plan should keep the repository’s own persistence and rule engine direction intact while reducing fallback ambiguity and aligning route, service, and UI contracts.
