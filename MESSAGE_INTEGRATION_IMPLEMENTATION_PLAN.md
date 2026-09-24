# Message Provider Integration Implementation Plan

## Objective

Implement a real external request intake flow for customer and service requests coming through email, WhatsApp, Microsoft Teams, and Telegram, then convert them into operational tasks through a controlled, auditable pipeline.

This is not only a message-fetch requirement. The system must shorten the cycle from external request arrival to triage, task creation, and team follow-up, while making requests visible to team managers, team leads, and authorized authorities.

The solution should support:

- live intake from external service requesters via provider channels
- classification of requests by customer, team, urgency, and workflow type
- parsing of email bodies and attachments into structured request data
- conversion of that data into defined task-creation flows
- dashboard visibility for leadership and personal follow-up for assigned users
- reporting and issue tracking after task creation and completion

This plan is meant to close the gap between the backend message architecture already present in the repo and the missing operational controls required for real external-service request handling.

---

## 1. Current state

The repository already contains the foundation for the architecture:

- canonical message model in `backend/src/models/messageTypes.ts`
- channel adapters in `backend/src/services/messaging/channelAdapters.ts`
- centralized intake logic in `backend/src/services/messaging/messageIntakeService.ts`
- webhook endpoints in `backend/src/routes/messages.ts`
- persisted message tables in `backend/src/database/migrations/017_messaging_intake_and_channels.sql`
- frontend simulation/configuration in `frontend/src/components/team/TeamChannelsTab.tsx`
- frontend client wrappers in `frontend/src/api/client.ts`

This means the project already has the message envelope, normalization, dedupe, classification, and outbound dispatch patterns. What is still missing is the real external request pipeline: message fetch + attachment parsing + task creation + visibility + follow-up reporting.

---

## 2. Problem statement

The current implementation supports:

- simulated inbound message injection
- team-level and personal channel configuration storage
- intake processing through a canonical message pipeline
- basic message inbox/outbox logging

But it does not yet support the real operational flow required by the business:

- external customers send requests through email or other chat channels
- those requests are imported as operational tasks by internal users
- attachments and files need to be parsed into a defined pipeline
- requests must be visible to managers and authority users without manual chasing
- task creation should use the message content and attached files as structured inputs, not only raw description text
- dashboard reporting and personal follow-up should reflect open, in-progress, escalated, and completed external requests

The current implementation is still centered on storing a request statement as a description and staging attachment files as loose task inputs. That is useful for intake, but it is not enough for an end-to-end external customer request lifecycle.

---

## 3. Target architecture

### 3.1 Core principles

1. Provider APIs are adapters, not business logic.
2. All inbound provider messages must normalize into the same `MessageEnvelope`.
3. External customer requests must be staged before task creation, with ownership and visibility preserved.
4. Attachments must flow through a deterministic parsing pipeline before becoming operational task inputs.
5. Task creation from messaging should be governed by the same maker-checker rules as other operational actions.
6. All provider actions must be traceable and auditable.
7. Provider integrations must be configurable per team and user.
8. Leadership and assigned users must have visibility without requiring a manual status chase.

### 3.2 Required external request lifecycle

```text
External customer request
  -> email / whatsapp / teams / telegram
  -> provider fetch connector
  -> raw payload normalization
  -> attachment extraction and file staging
  -> request parsing and metadata extraction
  -> dedupe and classification
  -> staged external request queue
  -> task creation proposal or direct issue creation
  -> team manager / authority visibility
  -> assigned user follow-up
  -> task completion pipeline
  -> reporting and dashboard roll-up
```

### 3.3 Attachment parsing pipeline

This is the required enhancement to the current approach:

```text
Incoming email / message payload
  -> message text extraction
  -> attachment discovery
  -> file type detection
  -> file staging in secure attachment store
  -> parser selection by file type
  -> structured field extraction
  -> category / urgency / customer mapping
  -> request payload assembled
  -> task creation request generated
  -> downstream task lifecycle and reporting
```

Supported file handling should include at least:

- PDF, DOCX, XLSX, CSV, JPG, PNG, and text-based files
- form or invoice attachments
- ticket-style attachments or complaint documents
- images with OCR extraction when needed

The parsed output should be mapped into fields such as:

- requester identity
- service category
- issue summary
- priority
- due date or SLA window
- associated customer account / entity
- required team or department owner
- attachment count and file evidence list

### 3.4 Manager and authority visibility requirement

The intended system behavior is to reduce the time between request receipt and action. It should give managers and authority users a clean view of:

- inbound external requests by source, team, and urgency
- pending requests awaiting intake or assignment
- tasks created from external messages
- escalated requests and blocked items
- follow-up status per assigned user
- SLA and overdue metrics for customer requests

This should be visible in both:

- team dashboard: aggregate operational visibility for leads and managers
- personal dashboard: individual follow-up queue for assigned staff

### 3.5 Personal and team follow-up flow

```text
Request arrives
  -> auto-label and classify
  -> assign to team / owner
  -> appear on manager dashboard
  -> appear on assigned user's personal queue
  -> user resolves or requests more info
  -> task follows completion pipeline
  -> update reporting and customer follow-up status
```

---

## 4. Backend implementation plan

### Phase 1: provider connection model

Create a provider registry and connection model:

- `provider_connections`
- `provider_fetch_jobs`
- `staged_messages`
- `staged_message_attachments`
- `staged_message_events`
- `external_request_enrichment`

Recommended fields:

```ts
interface ProviderConnection {
  id: string;
  teamId?: string;
  userId?: string;
  channel: 'email' | 'teams' | 'whatsapp' | 'telegram';
  displayName: string;
  status: 'ACTIVE' | 'PAUSED' | 'ERROR' | 'DISABLED';
  config: Record<string, any>;
  lastFetchAt?: string;
  lastError?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
```

Implementation notes:

- keep team-level and personal-level provider identities separate
- store secrets in environment/config layer, not in plaintext inside the app state
- enforce role-based permission on provider configuration edits
- include support for external customer request channels and owner routing rules

### Phase 2: provider fetch service

Create a provider abstraction:

- `EmailProviderConnector`
- `TeamsProviderConnector`
- `WhatsAppProviderConnector`
- `TelegramProviderConnector`

Each connector implements:

```ts
interface MessageProviderConnector {
  channel: 'email' | 'teams' | 'whatsapp' | 'telegram';
  testConnection(): Promise<boolean>;
  fetchNewMessages(): Promise<any[]>;
  normalize(rawPayload: any): MessageEnvelope;
}
```

Responsibilities:

- connect to provider API or polling source
- fetch new messages since last fetch timestamp
- map raw payloads to `MessageEnvelope`
- dedupe against `incoming_messages` and new staging records
- store stage result

### Phase 3: staging queue and external request enrichment

Create a staging service that does this:

1. fetch raw provider payload
2. normalize to `MessageEnvelope`
3. extract sender identity and external customer metadata
4. compute dedupe key
5. check for duplicates
6. save into `staged_messages`
7. extract and stage attachments
8. run request parsing and enrichment
9. classify request by category / urgency / owner
10. attach issue/task hints
11. mark as `NEW`, `REQUEST_REQUIRES_REVIEW`, or `READY_FOR_TASK_CREATION`

Recommended statuses:

- `NEW`
- `STAGED`
- `ATTACHMENT_PENDING`
- `PARSE_FAILED`
- `READY_FOR_TASK_CREATION`
- `REJECTED`
- `APPROVED`
- `CONVERTED_TO_TASK`
- `ESCALATED`
- `FAILED`

The key difference from the current implementation is that a staged external request should carry both:

- message text summary
- parsed attachment evidence and structured metadata
- team/owner routing information
- manager visibility state

### Phase 4: attachment parsing and structured intake

The system should not treat the incoming request as just a description string. A proper request object should be assembled from the message and its attachments.

Recommended parsing pipeline:

- detect file type and run file-specific parser
- extract text content from PDFs and Office docs
- OCR image files when necessary
- map extracted fields into canonical request fields
- allow override by human reviewer when parsing confidence is low
- persist both raw attachment data and parsed result in a structured payload

Attach to the task and issue record:

- request summary
- full source message body
- extracted customer/contact information
- file list and evidence references
- confidence score for parsed fields
- reviewer notes if human correction was needed

This ensures the task creation follow-up pipeline is built on structured intake rather than loose raw text.

### Phase 5: conversion and approval flow

The staged message should not automatically create issues/tasks unless the policy allows it.

Recommended rules:

- low-risk status requests can be auto-replied
- task creation with attachments may require maker approval
- escalations require team owner or checker review
- critical issues require a checker approval flow

Use the existing maker-checker patterns already defined in the project.

### Phase 6: provider message APIs

Add routes:

- `GET /api/messages/providers`
- `POST /api/messages/providers/test`
- `POST /api/messages/providers/:id/fetch`
- `GET /api/messages/staging`
- `GET /api/messages/staging/:id`
- `POST /api/messages/staging/:id/approve`
- `POST /api/messages/staging/:id/reject`
- `POST /api/messages/staging/:id/create-task`
- `POST /api/messages/staging/:id/escalate`
- `POST /api/messages/staging/:id/parse-attachments`
- `GET /api/external-requests/summary`

This gives the frontend a stable, operational API layer for external customer requests and attachment work.

### Phase 7: audit and retriable fetch behavior

Persist the following:

- fetch start/end time
- provider status
- per-message processing result
- linked issue id
- decision made by user
- approval id
- error trace

Also implement retry and rate-limiting logic for provider polling and webhook-based intake.

---

## 5. Frontend implementation plan

### Phase 1: external request intake tab

Add a new section or tab in the team workspace or settings area:

- External Requests
- Messaging Intake
- Provider Connections
- Staging Queue
- Recent Messages
- Follow-up Dashboard

This should be visible to team leads, admins, and authorized operators, with task visibility tailored for manager and personal follow-up views.

### Phase 2: provider connection UI

Each provider card contains:

- provider name
- channel type
- connection state
- last fetch time
- last error
- enable/disable toggle
- test connection button
- configure button

This replacement should be more than the current simple config form. It needs provider status and operational controls.

### Phase 3: staging queue UI for external requests

Create a list view for staged messages with customer-request context:

Columns:

- source
- sender / requester
- customer or case reference
- message preview
- attachment count
- parsed category
- urgency
- matched issue/task
- team owner
- priority
- actions

Actions:

- Review
- Approve
- Reject
- Create task
- Escalate
- Request clarification
- Ignore

Use a review drawer or modal to show:

- raw message text
- attachments
- parsed fields
- confidence score and parser status
- issue match suggestion
- team owner recommendation
- task creation payload preview
- action buttons

### Phase 4: live fetch controls and manager visibility

Add controls for:

- start polling
- stop polling
- force fetch
- retry failed jobs
- refresh queue

This is the missing component that makes the system operational, not just demonstrative.

### Phase 5: activity feed and dashboard visibility

Add a recent activity panel with:

- inbound message count
- processed count
- failed fetches
- created tasks
- escalations
- approvals
- requests waiting manager review
- SLA breach count
- assigned personal follow-up queue

This provides operational visibility without exposing the entire message engine internally, while also giving team managers and authorities the real-time picture they need.

### Phase 6: personal dashboard follow-up

Each assigned user should see:

- requests assigned to them
- tasks awaiting follow-up
- escalation status
- open customer communication threads
- due tasks and SLA status
- completed tasks and reporting summary

This closes the gap between intake and actual operational completion.

---

## 6. Data flow for the new UI

### Provider config

- user configures connection details
- frontend sends to backend `/api/messages/providers`
- backend validates and stores provider config
- backend returns connection status and fetch metadata

### Staged message review

- user clicks “Fetch now”
- backend fetches provider messages
- messages are normalized and inserted into staging queue
- frontend polls `GET /api/messages/staging`
- user approves or rejects a staged item
- backend converts it into issue/task or escalation

### Operational output

- issue/task record created
- link to original provider message stored
- outbound response queued if needed
- audit trail recorded

---

## 7. Frontend API additions

Add these methods in `frontend/src/api/client.ts`:

```ts
getMessageProviders: () => fetchApi<any[]>('/messages/providers');
createMessageProvider: (payload: any) => fetchApi<any>('/messages/providers', { method: 'POST', body: JSON.stringify(payload) });
testMessageProvider: (id: string) => fetchApi<any>(`/messages/providers/${id}/test`, { method: 'POST' });
fetchProviderMessages: (id: string) => fetchApi<any>(`/messages/providers/${id}/fetch`, { method: 'POST' });
getStagedMessages: (params?: { teamId?: string; status?: string; limit?: number }) => fetchApi<any[]>(...);
approveStagedMessage: (id: string) => fetchApi<any>(`/messages/staging/${id}/approve`, { method: 'POST' });
rejectStagedMessage: (id: string) => fetchApi<any>(`/messages/staging/${id}/reject`, { method: 'POST' });
createTaskFromStagedMessage: (id: string, payload?: any) => fetchApi<any>(`/messages/staging/${id}/create-task`, { method: 'POST', body: JSON.stringify(payload || {}) });
```

---

## 8. Recommended rollout order

### Step 1: backend queue + staging
- add provider connection storage
- add staged message tables
- add staging service
- add API routes

### Step 2: one provider live integration
- start with email or Teams
- confirm fetch, normalize, and stage loop
- validate dedupe and issue linking

### Step 3: frontend review UI
- provider cards
- staging list
- approve/reject actions
- create task from staged item

### Step 4: second provider integration
- add WhatsApp or Telegram
- validate cross-channel normalization

### Step 5: production hardening
- retry policy
- rate limiting
- monitoring and alerts
- audit dashboard

---

## 9. Risks to manage

1. message loops from provider re-delivery
2. duplicate inbound issue creation
3. unauthorized task creation from untrusted senders
4. provider misconfiguration causing uncontrolled noise
5. approval bypass in the UI layer
6. cross-team message visibility leakage

Mitigation:

- dedupe keys must be enforced at the DB layer
- provider fetch jobs must record last fetched IDs
- channel config must check team/user ownership
- critical task conversion should require checker approval
- all actions should be logged for audit

---

## 10. Final recommendation

The correct implementation is not just to fetch messages from providers. The correct implementation is to create a real external request intake pipeline that represents the actual operational need of the business:

- external service requesters send requests through email and other channels
- those requests are imported into the system through a shared intake pipeline
- the system labels, enriches, and parses the request including attachments
- the parsed request feeds a defined task-creation workflow
- managers and authority users can see the request immediately on dashboard views
- personal assigned users follow through the issue until completion and reporting

This means the system should keep the adapter layer channel-specific, but the processing layer must be request-centric and task-driven rather than message-only.

The strongest implementation pattern is:

- provider adapters normalize incoming payloads
- staging stores raw and parsed request data
- attachment parser pipeline creates structured request metadata
- task creation follows the existing operational task completion lifecycle
- reporting and dashboard follow-up remain connected to the issue lifecycle and the user queue

This is the missing bridge between the current backend architecture and the real operational workflow the product needs for external request intake, team visibility, and follow-up governance.
