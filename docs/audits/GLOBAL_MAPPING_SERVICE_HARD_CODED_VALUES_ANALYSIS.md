# Global Mapping Service Hard-Coded Values Analysis

## Executive Summary

The file [frontend/src/services/globalMappingService.ts](frontend/src/services/globalMappingService.ts) contains multiple hard-coded assumptions that are not production-safe for an external-system-agnostic mapping architecture.

The main issues are:

- fixed local storage keys
- fixed canonical repository table names
- fixed default DB IDs and DB names
- a rigid internal schema contract for transaction fields
- hard-coded SQL generation assumptions
- hard-coded header-mapping heuristics
- stale MongoDB-era naming in a PostgreSQL-first project

This violates the project rule that external database names, tables, and columns must never be hard-coded.

---

## 1) Fixed storage keys

The file defines fixed localStorage keys:

- STORAGE_KEY = 'global_mapping_schema_config_v2'
- CENTRAL_TABLE_STORAGE_KEY = 'central_uploaded_transactions_repo_v2'

These are not necessarily wrong by themselves, but they are hard-coded implementation details. In a production-ready system, config storage should be derived from a controlled config layer, not embedded as fixed browser-side constants.

This becomes risky when the system is expected to support multiple environments, multiple datasets, versioned governance, or backend-managed schema state.

---

## 2) Fixed canonical table name and DB defaults

The file includes hard-coded defaults such as:

- tableName = 'central_uploaded_transactions'
- dbId = 'mongoatlas'
- dbName = 'Application Working Database (MongoDB Atlas / Operational DB)'

These defaults are a direct contradiction of the repo’s stated architecture:

- PostgreSQL is the primary persistence layer
- external database mapping must be generic and dynamic
- external tables, columns, and names must not be hard-coded

This is a major production problem because the service silently assumes a central repository table exists in a specific synthetic database.

That assumption becomes the default behavior of the whole mapping engine.

---

## 3) Fixed canonical fields are treated as the global schema truth

The service defines a fixed schema vocabulary for transaction data, including fields such as:

- transaction_id
- created_at
- status_state
- user_email
- merchant_id
- hpan
- pan
- amount / amt / reqamt / conamt
- curr / currency
- terminal_id
- prcode
- etc.

These appear throughout the file in:

- getSqlDataType
- getSchemaModel
- generateSqlDdl
- generateJsonSchema
- transformRowToGlobalSchema
- autoGenerateColumnMapping

This is not just a convenience model; it becomes the canonical contract for the mapping layer.

That makes the mapping engine dependent on a hard-coded internal field vocabulary instead of a configurable metadata registry.

---

## 4) SQL generation is hard-coded to a single model

The SQL DDL generator uses a fixed default assumption:

- PostgreSQL dialect is the default
- generated indexes are fixed
- table names are created using internal assumptions
- field types are inferred from a fixed internal naming convention

Examples include:

- generateSqlDdl(tableName = 'central_uploaded_transactions', dialect = 'PostgreSQL')
- default index names like idx_central_uploaded_transactions_created
- default columns created from the presumed global schema

This means the engine does not truly support dynamic external systems unless the caller overrides everything manually.

---

## 5) Header mapping rules are hard-coded synonyms

The auto-generation logic contains a large set of domain-specific heuristics, including exact matching and synonym mapping for raw headers such as:

- reference / refnum / rrn / retrieval_ref_num
- amount / amt / reqamt / conamt
- pan / card / card_number / account
- time / date / timestamp / ttime
- terminal_id / merchant_id / mid
- prcode / proc_code
- status
- curr
- inst

This is useful as a fallback, but it is still hard-coded behavior. In production, these mappings should come from a metadata directory or table mappings, not from a one-off synonym dictionary embedded in the service.

This is especially risky because it means unknown external schemas are translated through an opinionated internal taxonomy rather than through explicit configuration.

---

## 6) Business semantics are embedded into transformation rules

The file makes assumptions about how business data should be normalized:

- PAN / card normalization
- amount parsing and currency stripping
- date normalization patterns
- boolean normalization

These rules are useful, but they are tightly coupled to canonical field keys and standard column names. That makes the service less system-agnostic.

Production mapping logic should treat normalization as metadata-driven, not name-driven logic baked into a central service.

---

## 7) The system still carries MongoDB-era identifiers

The file includes references such as:

- 'mongoatlas'
- 'Application Working Database (MongoDB Atlas / Operational DB)'
- 'MongoDB / Desktop Local Storage'

This conflicts with the repo architecture, which is clearly PostgreSQL-first and generic across multiple source systems.

This is a strong sign that some of the code was not fully migrated from a previous architecture.

---

## 8) The central repository table is treated as a system-level truth

The service creates and updates a central repository table automatically:

- buildCentralRepositoryTable
- alterCentralRepositoryTableOnNewField
- addTransactionToCentralRepository
- insertCentralRepositoryRecord
- clearAllStandardFields

This effectively creates a global internal repository as a default truth layer. In a production environment, that should be configurable and governed by database mappings, not hard-coded into the frontend service.

This is particularly risky if the app is expected to work with multiple external databases or dynamic data sources.

---

## 9) Default schema config is treated as authoritative state

The service loads config and falls back to defaults:

- standardFields = []
- tableMappings = {}

Then it silently rebuilds a canonical dataset and cache from those defaults.

This means the system may behave as if the default schema is valid state, even when no real mapping has been configured. That is dangerous in production because it can mask misconfiguration.

---

## Conclusion

This file contains multiple hard-coded values and assumptions that are not compliant with the project requirement to keep external database names, tables, and columns generic.

The most important issues are:

- fixed central table naming
- fixed database identity defaults
- fixed canonical transaction field vocabulary
- fixed global schema assumptions
- hard-coded SQL/DML generation
- hard-coded header heuristics
- stale MongoDB naming

These are not just code style issues; they are architectural risks.

For a production-safe implementation, the service should be refactored so that:

- table names and DB IDs come from configuration
- schema fields come from metadata or registry-driven definitions
- mapping dictionaries are authoritative, not heuristic defaults
- the canonical model is a fallback only, not the runtime truth
- database dialect behavior is configured rather than embedded

---

## Recommended remediation direction

1. Remove default hard-coded database identity values.
2. Move the global schema to a registry-driven source.
3. Restrict canonical field assumptions to a versioned config object.
4. Keep synonym mapping as a low-priority fallback, not a system truth.
5. Treat any generated central repository table as configuration-backed, not a fixed runtime default.
6. Remove stale MongoDB naming and default DB labels.

This would align the file with the project governance rule that external mapping must be dynamic, metadata-driven, and not hard-coded to specific database names, table names, or columns.
