# Master Architectural Plan: Executable Mapping & Recipe Engine (In-Task Saving & Autonomous Automation)

**Document Type:** Architectural Specification & Implementation Roadmap  
**Governance Standard:** [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md) (Rules 1, 7, 11, 16, 18, 19, 20, 22, 23) & [`bo-operational-governance`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/bo-operational-governance/SKILL.md)  
**Authoritative Entry Point:** [`MASTER_ARCHITECTURE_INDEX.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md)  
**Status:** Approved for Immediate Engineering Execution  
**Execution Date:** 2026-11-20  

---

## 1. Executive Purpose & Architectural Concept

In financial and back-office settlement workflows, a "Mapping" is **never merely a static key-value column renaming dictionary**. Real counterparty files (clearing feeds, card switch logs, Excel workbooks, core banking extracts, SFTP drops) exhibit complex structural variances:
- Multiple preamble banner lines before the true header
- Redundant or junk columns requiring removal
- Compound data fields requiring **splitting** (e.g. `TRANS_DESC` $\rightarrow$ `Type` + `Channel`)
- Disjoint columns requiring **merging** (e.g. `Branch_Code` + `Account_No` $\rightarrow$ `Full_Account`)
- Data format variances requiring **value translation** and rule execution (Ethiopian mobile phone normalizer, ISO decline code uppercase, value dictionaries)
- Inconsistent data types requiring **cleaning policies** (whitespace trimming, ISO-8601 date normalization, European comma decimal parsing, duplicate transaction removal, card PAN masking)
- Final column-to-column projection into canonical fields

Therefore, the system formalizes an **Executable Mapping** as:
$$\text{Executable Mapping Template} = \langle \text{Step-by-Step Recipe Pipeline} + \text{Column Mappings} \rangle$$

### Core Mandates:
1. **Saving During Task Creation & Intake**: Operators configuring a file or intake task in the UI can save the active recipe + column mappings as a named, versioned, team-scoped **Mapping & Recipe Template** in PostgreSQL.
2. **Task Record Binding**: Created tasks ([`issues`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/database/migrations/001_initial_schema.sql#L268)) physically store `mapping_template_id`, `recipe_snapshot`, and step execution metadata.
3. **Dedicated Backend Engine (`recipeExecutionService.ts`)**: Pure backend execution capable of loading the template from PostgreSQL and processing raw rows step-by-step without requiring a client browser session.
4. **Autonomous Automation Execution**:
   - **Scheduled FTP / SFTP Clearing Feeds** ([`ftpSchedulerService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ftpSchedulerService.ts)): Automatically executes the saved recipe step-by-step on newly discovered remote files before writing to PostgreSQL UNLOGGED mirror tables (`mirror_ftp_*`).
   - **Universal Hashtag Automations** ([`universalHashtagsEngine.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/universalHashtagsEngine.ts)): Type A and Type C directives execute the linked recipe pipeline deterministically.
   - **Any Other Plan / Task Re-Run**: Consistent repeatability across historical re-runs and ad-hoc investigations.

---

## 2. Step-by-Step Pipeline Execution Sequence

Every dataset processed by the backend engine advances through 7 distinct deterministic stages:

```
Raw File / Feed (CSV, XLSX, XML)
   │
   ▼
[ 1. Preamble & Header Slicing ] ──► (skip header lines, extract active header row)
   │
   ▼
[ 2. Column Drops / Exclusions ] ──► (strip unwanted / excluded columns)
   │
   ▼
[ 3. Split Operations ]          ──► (split compound fields by delimiter/space into child columns)
   │
   ▼
[ 4. Merge Operations ]          ──► (concatenate multiple fields with separator into target column)
   │
   ▼
[ 5. Value Translations & Rules] ──► (apply system transformation rules & value dictionaries)
   │
   ▼
[ 6. Data Cleaning Policies ]    ──► (trim whitespace, ISO dates, amount sanitization, dedup, drop empty)
   │
   ▼
[ 7. Canonical Column Mapping ]  ──► (project clean columns to Global Canonical Schema or Mirror columns)
   │
   ▼
Standardized Staging in PostgreSQL (task_dataset_transactions & mirror_ftp_*)
```

---

## 3. Engineering Implementation Roadmap

### Phase 1: Database Schema & Relational Persistence
- **Migration `047_executable_mapping_recipes.sql`**:
  - Add `mapping_template_id VARCHAR(64) REFERENCES file_ingestion_mapping_templates(id)` to `issues`.
  - Add `recipe_snapshot JSONB DEFAULT '{}'::jsonb` to `issues`.
  - Add `recipe_execution_log JSONB DEFAULT '[]'::jsonb` to `issues`.
  - Add `mapping_template_id VARCHAR(64) REFERENCES file_ingestion_mapping_templates(id)` to `ftp_file_staging_configs`.
  - Extend `file_ingestion_mapping_templates` with `ordered_recipe_steps`, `split_operations`, `merge_operations`, `transform_operations`, `cleaning_actions`, `version`.
- **Repository Methods in `backend/src/store/postgresRepo.ts`**:
  - Ensure `createOrUpdateFileMappingTemplate` persists all recipe step arrays.
  - Update `createIssue` and `getIssueById` to persist and hydrate `mapping_template_id`, `recipe_snapshot`, and `recipe_execution_log`.

### Phase 2: Core Backend Recipe Execution Engine
- **File**: `backend/src/services/recipeExecutionService.ts`
- **Capabilities**:
  - `executeRecipe(rows: Record<string, any>[], template: FileIngestionMappingTemplate, options?: ExecutionOptions)`:
    - Slices preambles based on `header_mode` and `header_row_index`.
    - Filters out `deleted_columns`.
    - Evaluates `split_operations` (space, comma, hyphen, pipe, custom delimiter).
    - Evaluates `merge_operations` (concatenation with separators).
    - Queries `system_transformation_rules` and `value_translation_dictionaries` to execute field-level mutations.
    - Applies `cleaning_policies` (trim, ISO dates, decimal amounts, exact deduplication, card PAN masking).
    - Projects mapped columns to canonical target keys.
  - Generates a step-by-step audit trail (`stepAuditTrail: { stepNum, action, affectedRowsCount, durationMs }[]`).
- **REST API Routes in `backend/src/routes/misc.ts`**:
  - `POST /api/recipe-execution/preview`: Dry-run preview of recipe execution on sample rows.
  - `POST /api/recipe-execution/execute`: Executes recipe on full dataset.

### Phase 3: Task Creation & In-Task Recipe Saving
- **Frontend Workspace**: [`frontend/src/components/issue/WorkspaceTaskCreator.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/issue/WorkspaceTaskCreator.tsx)
  - Add direct **"Save as Mapping & Recipe Template"** button on the file ingestion review header and in the Recipes tab.
  - Modal prompts for Template Name, Team scope, and description.
  - Saves template to backend via `api.createFileMappingTemplate` with all active recipe steps.
  - Automatically selects the newly saved template.
  - Passes `mappingTemplateId` and `recipe` when submitting task via `handleCreateTaskSubmit`.
- **Backend Task Creation Route**: [`backend/src/routes/issues.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/routes/issues.ts)
  - Persists `mapping_template_id` and `recipe_snapshot`.
  - Routes dataset through `recipeExecutionService` to ensure `task_dataset_transactions` receives fully standardized canonical transactions.

### Phase 4: Autonomous Automation Integration
- **FTP File Staging & Scheduler**:
  - [`backend/src/services/ftpFileStagingService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ftpFileStagingService.ts) and [`backend/src/services/ftpSchedulerService.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/ftpSchedulerService.ts).
  - When staging FTP clearing files, if `config.mappingTemplateId` is set, fetch the template and run `recipeExecutionService.executeRecipe(rawRows, template)`.
  - The UNLOGGED mirror tables (`mirror_ftp_*`) receive clean, normalized records matching the exact task recipe.
- **FTP Feed UI**:
  - Add template selector in [`frontend/src/components/intake/FtpScheduleConfigModal.tsx`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/frontend/src/components/intake/FtpScheduleConfigModal.tsx) and FTP Feeds table.
- **Universal Hashtag Engine**:
  - [`backend/src/services/universalHashtagsEngine.ts`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/backend/src/services/universalHashtagsEngine.ts): Executes linked mapping template recipes during Type A and Type C hashtag runs.

### Phase 5: Verification & Zero-Assumption Testing
- Build and execute `backend/src/scripts/verify_recipe_automation_suite.ts`:
  - Verify PostgreSQL schema columns on `issues`, `file_ingestion_mapping_templates`, and `ftp_file_staging_configs`.
  - Verify template persistence with complete step arrays.
  - Verify `recipeExecutionService` sequential step execution (splits, merges, cleaning, translations, canonical mapping).
  - Verify task creation with bound `mapping_template_id`.
  - Verify automated FTP staging invoking recipe engine.
- Verify 100% clean builds across backend TypeScript (`tsc --noEmit`) and frontend (`vite build`).

---

## 4. Architectural Governance & Sign-Off Checklist

- [x] **Rule 1 (PostgreSQL First)**: All templates, recipes, and task bindings persisted in relational tables.
- [x] **Rule 19 (Team Scoping)**: Templates scoped to `team_id` with access control.
- [x] **Rule 20 (Evidence-Based Workflow)**: Full 6-phase engineering process with automated reality check.
- [x] **Rule 22 (Master Architecture Index)**: Registered in `MASTER_ARCHITECTURE_INDEX.md`.
- [x] **Rule 23 (No Business Logic in Local Storage)**: Recipe execution handled by pure backend engine.
