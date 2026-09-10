# Configured Data Sources & Available Tables Report

**Updated Date:** 2026-09-04  
**Environment:** Operational Workflow Manager  
**Backend Port:** `5002`  
**Introspection Mode:** 100% Live Database Catalog (`information_schema` & native drivers - No Mock Fallbacks)

---

## 1. Executive Summary

All configured data sources have been verified with live database drivers (`mysql2`, `pg`, `mongoose`). Synthetic fallback tables (`transactions_master`, `cur_trax`, `audit_log`) have been completely removed.

| Data Source Name | Engine | Host & Port | Target Database | Connection Status | Latency | Live Discovered Tables / Collections |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **BOtes** | MySQL | `127.0.0.1:3306` | `bo_test` | **ONLINE (PASS)** | `~2ms` | `auth_log` (1 physical table) |
| **mongoatlas** | MongoDB | `0.0.0.0:27017` | `operational_workflow_db` | **ONLINE (PASS)** | `~3ms` | 28 active collections |
| **Postgrase** | PostgreSQL | `localhost:5432` | `operational_workflow_db` | **ONLINE (PASS)** | `~14ms` | 0 tables (genuine state; no tables created yet in `public` schema) |

---

## 2. Detailed Data Source Breakdown

### 1. BOtes (MySQL)

* **ID:** `db-1787934403689`
* **Engine:** MySQL 8.x
* **Host:** `127.0.0.1`
* **Port:** `3306`
* **Target Database:** `bo_test`
* **Username:** `root`
* **Connection String:** `mysql://root:******@localhost:3306/bo_test`
* **API Endpoint:** `https://api.paymentops.internal/db/botes`
* **Status:** Online
* **Last Test Latency:** `2ms`
* **Physical Tables in `bo_test` Database:**
  - `auth_log`
* **Columns Introspected in `auth_log`:**
  - `tran_id` (`INT`, Primary Key, Not Null)
* **Allowed Workspace Tables:**
  - `auth_log`

---

### 2. mongoatlas (MongoDB)

* **ID:** `db-1788012273045`
* **Engine:** MongoDB
* **Host:** `0.0.0.0`
* **Port:** `27017`
* **Target Database:** `operational_workflow_db`
* **Username:** `workflow`
* **Connection String:** `mongodb://0.0.0.0:27017/operational_workflow_db`
* **Status:** Online
* **Last Test Latency:** `3ms`
* **Discovered Collections (28 collections):**
  1. `connectionusagelogs` (20 documents)
  2. `databaseconnections` (3 documents)
  3. `databasevalidationworkflows` (1 document)
  4. `dbaccessrequests` (0 documents)
  5. `directmessages` (8 documents)
  6. `environmentsystems` (1 document)
  7. `global_mapping_repository` (0 documents)
  8. `global_standard_directory` (0 documents)
  9. `globaltransactionschemaconfigs` (1 document)
  10. `hashtagpresets` (0 documents)
  11. `investigationbatches` (0 documents)
  12. `investigationtasks` (0 documents)
  13. `investigationtransactions` (0 documents)
  14. `issues` (3 documents)
  15. `notifications` (11 documents)
  16. `organizations` (3 documents)
  17. `plugins` (2 documents)
  18. `queryapprovalrequests` (1 document)
  19. `queryextractions` (0 documents)
  20. `teamdiscussionmessages` (0 documents)
  21. `teaminsights` (0 documents)
  22. `teams` (2 documents)
  23. `teamtasks` (0 documents)
  24. `transactiontemplates` (0 documents)
  25. `uploadauditlogs` (0 documents)
  26. `uploadedtransactionrecords` (0 documents)
  27. `users` (6 documents)
  28. `workspacetablerecords` (66 documents)

---

### 3. Postgrase (PostgreSQL)

* **ID:** `db-1788024182731`
* **Engine:** PostgreSQL 18.x
* **Host:** `localhost`
* **Port:** `5432`
* **Target Database:** `operational_workflow_db`
* **Username:** `postgres`
* **Connection String:** `postgresql://postgres:******@localhost:5432/operational_workflow_db`
* **Status:** Online
* **Last Test Latency:** `~14ms`
* **Live Introspected Tables in `public` Schema:**
  - `[]` (0 tables — genuine state, no tables created in database yet)
* **Allowed Workspace Tables:**
  - `[]`
