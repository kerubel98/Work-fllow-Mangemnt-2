# Backend Models: Historical / MongoDB Fallback Layer

> [!WARNING]
> **ARCHITECTURAL GOVERNANCE NOTICE**
> The active, primary database for this application is **PostgreSQL** (`operational_workflow_db`), managed through the 22-table relational schema in `backend/src/database/migrations/001_initial_schema.sql` and the active repository `backend/src/store/postgresRepo.ts`.

### Purpose of This Directory
The Mongoose models in this directory (`backend/src/models/`) are legacy schemas retained strictly for optional, backward-compatible MongoDB fallback in `backend/src/store/repository.ts`.

### Governance Rules for Contributors and AI Assistants:
1. **DO NOT** use or import these Mongoose models when implementing new features, endpoints, or persistence layers.
2. **ALL** operational persistence must be added to `backend/src/types.ts`, `001_initial_schema.sql`, and `backend/src/store/postgresRepo.ts`.
3. Set-based batch reconciliations and validations must use **PostgreSQL UNLOGGED mirror tables** (`mirror_{db}_{table}`) and the SQL compiler (`ruleSqlCompiler.ts`).
