# System Architecture & Context: Global Mapping Schema & Multi-Database Operational Platform

This document provides a comprehensive technical overview, architectural specifications, and domain context for the **Operation Workflow Management** platform. Use this document as context for prompt engineering, AI agents, or developers interacting with the codebase.

---

## 1. Executive Summary & Core Purpose

The **Global Mapping Schema & Multi-Database Workspace** is an enterprise-grade fintech operations and reconciliation platform. It is engineered to solve core payment discrepancy challenges across heterogeneous banking networks, card processing gateways, settlement clearing feeds, and external enterprise databases (e.g., CBS / Core Banking System, Oracle, PostgreSQL, MySQL, SQLite).

### Key Business Goals:
- **Canonical Data Normalization**: Bridge disparate schema formats (varying column naming, casing, and types across databases and gateway exports) through a central **Global Mapping Schema**.
- **Automated Incident & Issue Triage**: Enable payment operations teams to manage exceptions, investigate stuck or declined transactions, and apply automated hashtag-based `#` resolution presets with pre-validated SQL scripts.
- **Visual Rule Builder & Sequential Validation**: Create multi-step validation rules and conditional pipelines directly linked to Global Mapping Schema parameters (e.g., verifying existence in DB, checking ISO-8583 decline codes, confirming status transitions, checking 24h SLA delivery).
- **Multi-Database Cross-Verification**: Query multiple live external databases concurrently using normalized parameters, identify ledger desynchronizations, and generate dynamic remediation scripts.
- **Auditability & Enterprise Governance**: Enforce RBAC (Role-Based Access Control), dual-control query approvals for destructive DML/DDL queries, sequential audit logging, and automated schema change tracking.

---

## 2. High-Level Technology Stack

### Frontend Application (`/frontend`)
- **Core Framework**: React 18 + TypeScript + Vite.
- **Styling**: Vanilla Tailwind CSS with custom responsive layouts, dark/light contrast cards, and status tags.
- **Icons**: `lucide-react`.
- **State Management & Services**:
  - `globalMappingService.ts`: Central singleton service managing Global Mapping Schema models, field definitions, table mappings, DDL generation, JSON Schema validation, and LocalStorage persistence.
  - Custom React Hooks & Context: Reactive updates across workspace settings, tables, and modal dialogs.
- **API Client**: Fetch-based REST client with fallback to mock/in-memory data when backend services are disconnected.
- **Port & Dev Server**: Vite development server running on `http://localhost:5173`.

### Backend Application (`/backend`)
- **Runtime & Framework**: Node.js, Express.js with TypeScript (`tsx` runtime / `tsc` build).
- **Primary Database**: MongoDB (via Mongoose ODM) with an automatic resilient in-memory fallback store (`store/dataStore.ts`) when MongoDB is unavailable.
- **Multi-Database Connection Engine**: Supports live remote connections to:
  - MySQL (`mysql2/promise`)
  - PostgreSQL (`pg`)
  - Oracle (`oracledb`)
  - SQLite (`sqlite3`)
- **AI Integration**: Google Gemini API (`@google/genai`) for operational recommendations, SQL generation, and root-cause assistance.
- **Real-Time Events**: Server-Sent Events (SSE) via `/api/events` for real-time team notifications, task assignment alerts, and system broadcast messages.
- **Port & Server**: Express server running on `http://localhost:3000` (or `PORT` env var).

---

## 3. High-Level Architecture Diagram

```
+----------------------------------------------------------------------------------------------------+
|                                      FRONTEND (React + Vite + TS)                                  |
|                                                                                                    |
|  +---------------------------+  +--------------------------------+  +---------------------------+  |
|  |    Global Mapping Schema  |  |   Database Validation Settings |  |  Investigation Workspace  |  |
|  |     (Schema & DDL Engine) |  |   (Multi-Step Rule Builder)    |  |  (Cross-Verification Tool)|  |
|  +---------------------------+  +--------------------------------+  +---------------------------+  |
|  +---------------------------+  +--------------------------------+  +---------------------------+  |
|  |   Operational Case Queue  |  |    Workspace Table & Viewer    |  |  SQL Sandbox & Query Tool |  |
|  |   (Hashtag Presets & Rule)|  |    (Central Transformed Data)  |  |  (Multi-Dialect Exec)     |  |
|  +---------------------------+  +--------------------------------+  +---------------------------+  |
+-------------------------------------------------+--------------------------------------------------+
                                                  | REST API & SSE (/api/*)
+-------------------------------------------------v--------------------------------------------------+
|                                      BACKEND (Node.js + Express + TS)                              |
|                                                                                                    |
|  +---------------------+  +----------------------+  +---------------------+  +------------------+  |
|  |  /api/auth          |  |  /api/transactions   |  |  /api/db            |  |  /api/issues     |  |
|  |  JWT / Session RBAC |  |  Schema & Templates  |  |  Multi-DB Runner    |  |  Case & Queue    |  |
|  +---------------------+  +----------------------+  +---------------------+  +------------------+  |
|  +---------------------+  +----------------------+  +---------------------+  +------------------+  |
|  |  /api/teams         |  |  /api/collaboration  |  |  /api/ai            |  |  /api/events     |  |
|  |  Team Workspaces    |  |  Direct Messages     |  |  Gemini Advisor     |  |  SSE Broadcast   |  |
|  +---------------------+  +----------------------+  +---------------------+  +------------------+  |
+-------------------------------------------------+--------------------------------------------------+
                                                  |
          +---------------------------------------+--------------------------------------+
          |                                                                              |
+---------v-------------------------+                          +-------------------------v---------+
|        PERSISTENCE LAYER          |                          |      EXTERNAL TARGET DATABASES    |
| - MongoDB (Mongoose Models)       |                          | - Core Banking System (CBS)       |
| - Fallback In-Memory Data Store   |                          | - PostgreSQL / MySQL / Oracle     |
+-----------------------------------+                          +-----------------------------------+
```

---

## 4. Key Functional Modules & Implementation Details

### 4.1 Global Mapping Schema Engine (`globalMappingService.ts`)
- **Canonical Schema Definition**: Defines the standard enterprise payment entity model with core fields such as:
  - `transaction_id`: Primary transaction/auth reference (`string`)
  - `card_number`: Masked PAN / security token (`string`)
  - `amount_usd`: Standard numeric charge amount (`number`)
  - `status_state`: Normalized transaction lifecycle (`AUTHORIZED`, `SETTLED`, `DECLINED`, `PENDING`, `REVERSED`)
  - `created_at`: ISO UTC timestamp (`date`)
  - `user_email`: Customer identifier (`string`)
  - `merchant_id`: MID / terminal descriptor (`string`)
  - `response_code`: ISO-8583 2-digit response code (`string`)
  - `currency`: ISO-4217 3-letter currency (`USD`, `EUR`, `GBP`)
  - `terminal_id`, `dispute_reason`, `batch_seq_num`
- **Table-to-Global Mapping**: Maintains mapping tables matching physical database columns (e.g. `cbs_tran_amt`, `tran_status_cd`) to canonical schema keys.
- **Dynamic DDL & Data Contract Generation**:
  - Automatically produces SQL `CREATE TABLE` and `COMMENT` statements for PostgreSQL, Oracle, and MySQL dialects.
  - Generates JSON Schema Draft-07 contracts and TypeScript interface models.

### 4.2 Database Validation Rules & Rule Builder (`DatabaseValidationSettings.tsx`)
- **Visual Rule Builder**:
  - **Block 1 (Lookup Target & Mandatory Input Keys)**: Configures input parameters. **Directly populated from the Global Mapping Schema**, featuring interactive parameter badges (`+transaction_id`, `+amount_usd`, `+status_state`) and a schema dropdown selector.
  - **Block 2 (Verification Criteria)**: Supports 4 verification types:
    1. `EXISTENCE_CHECK`: Validates entity presence in the target database.
    2. `FIELD_COMPARATOR`: Checks column status vs expected values (Target Field is linked via autocomplete datalist to Global Mapping Schema fields).
    3. `ISO_DECLINE_CODE`: Flags bank decline codes (`05`, `51`, `14`, `96`).
    4. `SQL_CONDITION`: Executes custom expressions and SLA time checks (e.g. `TIMESTAMPDIFF(HOUR, created_at, shipped_at) <= 24`).
  - **Block 3 (Execution Logic & Severity)**: Conditional execution triggers (`ALWAYS`, `IF_PREV_SUCCESS`, `IF_PREV_FAILURE`), failure severity (`CRITICAL`, `WARNING`, `INFO`), and diagnostic messaging.
- **Test Runner & Simulation**: Simulates the multi-step pipeline against test parameters pre-filled from Global Mapping Schema example values.

### 4.3 Multi-Database Cross-Verification Panel (`DatabaseCrossVerificationPanel.tsx`)
- Allows operators investigating an incident to select:
  1. A source dataset lookup parameter (from the Global Mapping Schema, e.g. `transaction_id`).
  2. The target database column.
  3. One or more external target databases (e.g., CBS, Payment Gateway DB, Warehouse DB).
- Queries external databases, displays side-by-side reconciliation differences (amount mismatches, status drift, unhandled chargebacks), and auto-generates SQL update scripts.

### 4.4 Operational Issues & Hashtag Presets (`IssueDetailView.tsx`, `HashtagManager.tsx`)
- **Cases & Tasks**: Operational tickets categorized by priority (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) and status (`OPEN`, `INVESTIGATING`, `RESOLVED`).
- **Hashtag Resolution Presets (`#`)**: Predefined resolution workflows (e.g. `#ISO_DECLINE_RETRY`, `#STUCK_TERMINAL`, `#REVERSED_FEE`) containing:
  - Header structure expectations
  - Determination criteria rules
  - Parameterized SQL resolution scripts (`UPDATE transactions SET status = 'REVERSED' WHERE transaction_id = '{{Transaction_ID}}';`)

### 4.5 SQL Query Sandbox & Multi-Dialect Tool (`DbQueryTool.tsx`)
- Connects to active external database configurations.
- Translates queries between SQL dialects (PostgreSQL, Oracle, MySQL, SQLite).
- Supports safety guardrails: read-only detection, row limits, and a dual-approval request workflow for dangerous DML/DDL executions.

---

## 5. Directory Structure & Key Files

```
opration-workflow-mangement1/
├── backend/
│   ├── src/
│   │   ├── config/              # Database connections (MongoDB, MySQL) and seed data
│   │   ├── middleware/          # JWT and role-based authorization middleware
│   │   ├── models/              # Mongoose models (User, Issue, HashtagPreset, DatabaseConnection, etc.)
│   │   ├── routes/              # Express API routers (auth, db, issues, transactionSettings, ai)
│   │   ├── services/            # Database executor and query execution services
│   │   ├── store/               # In-memory data store fallback & repository layer
│   │   ├── types.ts             # Backend TypeScript interfaces and data contracts
│   │   └── server.ts            # Main backend server entry point
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── api/                 # REST API client (`client.ts`)
│   │   ├── components/
│   │   │   ├── admin/           # Administrative configuration & plugins
│   │   │   ├── investigation/   # Multi-DB cross-verification, query workspaces
│   │   │   ├── issue/           # Hashtag preset manager, issue resolution panels
│   │   │   ├── settings/        # DatabaseValidationSettings (Rule Builder & Workflows)
│   │   │   ├── transactions/    # Transaction schema builder
│   │   │   ├── DbQueryTool.tsx  # SQL Sandbox & Multi-DB executor
│   │   │   ├── GlobalTransactionSettings.tsx # Global Mapping Schema management & DDL
│   │   │   ├── IssueCreator.tsx # New issue creator & batch reconciliation validator
│   │   │   ├── IssueDetailView.tsx # Master operational workspace & triage
│   │   │   ├── SideNav.tsx      # Application sidebar navigation
│   │   │   └── WorkspaceSettings.tsx # Environment & workspace settings
│   │   ├── services/
│   │   │   └── globalMappingService.ts # Central Global Mapping Schema engine
│   │   ├── types.ts             # Frontend TypeScript types and interfaces
│   │   ├── App.tsx              # Root React component & tab routing
│   │   └── main.tsx             # Frontend entry point
│   ├── package.json
│   └── vite.config.ts
├── metadata.json                # Project identification & capabilities
└── package.json                 # Root script runner
```

---

## 6. Guidelines for AI Prompting & System Modifications

When interacting with this codebase or crafting prompts for AI models, adhere to these conventions:

1. **Schema Terminology**:
   - **Global Mapping Schema**: The canonical enterprise data dictionary and standard model (`GlobalTransactionSchemaField`, `globalMappingService`).
   - **Table Mapping**: The translation layer that binds specific database table columns to the Global Mapping Schema keys.
   - Do **not** confuse the Global Mapping Schema with MongoDB/Mongoose schemas or individual external DB schemas.

2. **Rule Builder Context**:
   - The Rule Builder is located in `frontend/src/components/settings/DatabaseValidationSettings.tsx`.
   - All input parameters and target fields in the Rule Builder should reference keys defined in the Global Mapping Schema (`globalMappingService.getStandardFields()`).

3. **Building & Running**:
   - Frontend build: `cmd /c "npm run build"` (in `/frontend`).
   - Backend run: `npm run dev` (in `/backend`).
   - Always verify TypeScript types in `frontend/src/types.ts` and `backend/src/types.ts` when modifying data structures.
