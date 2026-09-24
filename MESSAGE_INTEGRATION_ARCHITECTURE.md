# Messaging Integration Architecture

## Objective

Build a single operational message intake system that can accept messages from email, WhatsApp, Microsoft Teams, Telegram, and similar channels, normalize them, classify intent, and convert them into structured operational tasks, follow-ups, approvals, or escalations without creating channel-specific business logic.

The design must align with the existing workflow engine, approval governance, task lifecycle, and escalation model in this repository.

---

## 1. Design principle

The project should not treat each messaging app as a separate workflow system.

Instead, use a unified architecture:

- each app connects through a channel adapter
- adapters convert app payloads into a common message envelope
- a shared intake service classifies the message
- a central routing engine decides whether to create a task, update an issue, send a reply, request approval, or trigger an escalation
- the workflow engine remains the operational core

This keeps the system consistent across all communication channels while remaining flexible for different vendor APIs.

---

## 2. Integrated room access model

Messages from external apps must be surfaced into the system through two access patterns:

### A. Personal chat rooms

Used for worker-level communication and direct operational follow-up.

Examples:
- assigned operator receives task update
- requester receives status confirmation
- approver receives decision request
- owner receives follow-up notification

A personal room should contain:
- the task or issue reference
- the last decision or status update
- the relevant evidence reference
- a compact action list
- only the user-specific message thread and relevant data

### B. Group / team chat rooms

Used for shared operational work, escalation handling, and team decision-making.

Examples:
- team-specific issue queue
- workflow exception room
- escalation review room
- cross-functional coordination room

A group room should contain:
- the issue or workflow context
- summary and current status
- team participants and owners
- linked evidence or attachment references
- actionable commands and decision notes
- latest operational updates from the system

### Access rule

The same integrated message source can appear in both contexts, but the visibility must be controlled by role and access rules:

- personal messages stay in the assignee or requester room
- team messages are surfaced in the shared team room when the issue is shared
- escalations become visible to the escalation team and designated lead
- approvals are visible to the assigned checker or approver only
- system-generated messages remain traceable and auditable but do not create uncontrolled loops

This allows a single incoming message to be represented in multiple views without duplicating the actual workflow state.

---

## 3. Channel identity configuration model

The system should support two separate configuration layers:

### A. Team-level communication identities

Each team can register the communication addresses it uses for operational work.

Examples:
- team email adders
- distribution list / shared inbox
- Teams group or channel address
- WhatsApp group chat or business number
- Telegram group chat id
- shared service mailbox for escalation handling

Required fields:

```ts
interface TeamChannelConfiguration {
  id: string;
  teamId: string;
  channel: 'email' | 'teams' | 'whatsapp' | 'telegram';
  displayName: string;
  address: string; // team inbox, group id, channel id, alias
  isPrimary: boolean;
  isActive: boolean;
  permissions: Array<'read' | 'reply' | 'create_task' | 'escalate'>;
  createdBy: string;
  createdAt: string;
}
```

This is used for team-level routing, escalation coordination, and shared issue updates.

### B. Personal communication identities

Each user can register the addresses and chat identities they personally use for operational follow-up.

Examples:
- personal email address
- user Teams account identity
- personal WhatsApp number or business contact
- Telegram account id / alias
- direct chat room id used for status follow-up

Required fields:

```ts
interface PersonalChannelConfiguration {
  id: string;
  userId: string;
  channel: 'email' | 'teams' | 'whatsapp' | 'telegram';
  displayName: string;
  address: string;
  isDefault: boolean;
  isActive: boolean;
  notificationMode: 'all' | 'critical_only' | 'manual';
  createdAt: string;
}
```

This is used for personal task updates, owner follow-ups, approvals, and direct status replies.

### C. Routing rule between personal and team identities

- if a task is assigned to a single user, the response should route to that user’s personal channel configuration
- if the task is team-driven or shared, route to the team channel configuration
- if a review or escalation is shared among multiple teammates, use the team configuration
- if a channel is configured at both team and personal level, the task owner and escalation policy decide which one is used

This makes the integration model flexible while still preserving a single operational message standard.

---

## 4. Core architecture

```text
Email / WhatsApp / Teams / Telegram
        │
        ▼
Channel Adapters
  - EmailAdapter
  - TeamsAdapter
  - WhatsAppAdapter
  - TelegramAdapter
        │
        ▼
Message Normalization Layer
  - parse payload
  - extract sender, text, attachments, metadata
  - create canonical MessageEnvelope
        │
        ▼
Message Router / Classifier
  - classify intent
  - detect duplicates
  - match existing issue/task
  - determine approval requirements
        │
        ▼
Operational Service Layer
  - TaskCreationService
  - FollowUpService
  - EscalationService
  - ApprovalService
  - WorkflowExecutionService
        │
        ▼
Persistence + Audit
  - message_log
  - attachment_store
  - task_records
  - workflow_runs
  - approval_requests
  - escalation_events
        │
        ▼
Outbound Response Dispatchers
  - EmailSender
  - TeamsSender
  - WhatsAppSender
  - TelegramSender
```

---

## 4. Message envelope

Every channel adapter should convert inbound messages to the same internal object.

```ts
interface MessageEnvelope {
  messageId: string;
  sourceChannel: 'email' | 'teams' | 'whatsapp' | 'telegram';
  sourceMessageId: string;
  conversationId: string;
  threadId?: string;
  senderId: string;
  senderName?: string;
  senderType: 'person' | 'team' | 'bot' | 'system';
  teamId?: string;
  personId?: string;
  receivedAt: string;
  textBody?: string;
  htmlBody?: string;
  attachments?: MessageAttachment[];
  metadata?: Record<string, any>;
  intent?: MessageIntent;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  rawPayload?: Record<string, any>;
}

interface MessageAttachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes?: number;
  url?: string;
  checksum?: string;
  contentType: 'document' | 'image' | 'spreadsheet' | 'pdf' | 'audio' | 'other';
}
```

This is the single contract the rest of the app should use.

---

## 5. Message classification model

Each incoming message must be classified into a known category before action is taken.

### Supported categories

- `REQUEST_CREATE_TASK`
- `REQUEST_STATUS_UPDATE`
- `FOLLOW_UP`
- `TEAM_ESCALATION`
- `PERSONAL_RESPONSE`
- `APPROVAL_REQUEST`
- `ATTACHMENT_TASK`
- `DATA_INPUT_TASK`
- `SYSTEM_NOTIFICATION`

### Example routing rules

- if message contains a document, image, spreadsheet, or PDF -> classify as attachment-based request
- if it references an existing issue/task identifier -> link to existing record
- if it contains `@team` or cross-team language -> classify as team escalation
- if it asks for status -> classify as status update request
- if it contains a direct approval or rejection instruction -> classify as approval event
- if it mentions an operational action but no known case -> create a new task draft

---

## 6. Task creation from attachments and payloads

This needs to be a dedicated intake pipeline.

### Intake flow

1. message is received
2. message is normalized
3. message is classified
4. attachment parser is triggered if needed
5. parser extracts structured data
6. task builder creates a normalized task payload
7. task is validated against business rules
8. workflow engine is invoked if required
9. task is created and linked to evidence

### Attachment processing

For each attachment type:

- spreadsheet/csv/xlsx -> route to dataset ingestion pipeline
- PDF -> OCR or document classification service
- image -> OCR and extraction
- JSON / structured payload -> parse directly
- email forward with plain text -> natural-language extraction

### Example task payload

```ts
interface TaskCreationPayload {
  sourceChannel: string;
  sourceMessageId: string;
  requesterId?: string;
  teamId?: string;
  issueTitle?: string;
  taskType?: string;
  description?: string;
  extractedFields?: Record<string, any>;
  attachments?: string[];
  priority?: 'low' | 'normal' | 'high' | 'critical';
  workflowTemplate?: string;
  evidenceRefs?: string[];
}
```

This payload then feeds the existing issue/task model in the project.

---

## 7. Follow-up response model

There should be two response scopes:

### Personal response
Used when a message is addressed to an individual owner or assignee.

Examples:
- assigned user asks for status update
- task is ready for review
- follow-up is required on a single task

### Team response
Used when the message affects a team or cross-functional workflow.

Examples:
- SLA risk
- blocked workflow
- cross-team escalation
- issue with shared owner

### Routing rule

The response layer decides scope based on:

- assignee ownership
- team membership
- issue state
- escalation state
- whether the task requires approval

---

## 8. Outbound messaging engine

All outbound responses should be sent through a dispatcher layer, not directly from task services.

### Dispatcher responsibilities

- choose channel based on target
- render message template
- create safe replies and notifications
- attach evidence references if needed
- log response event for audit

### Example senders

- `EmailSender`
- `TeamsSender`
- `WhatsAppSender`
- `TelegramSender`

Each sender must implement a common interface:

```ts
interface MessageSender {
  send(message: OutboundMessage): Promise<void>;
}

interface OutboundMessage {
  to: string;
  channel: 'email' | 'teams' | 'whatsapp' | 'telegram';
  subject?: string;
  body: string;
  attachments?: string[];
  metadata?: Record<string, any>;
}
```

---

## 9. Governance and approval rules

Any message that creates or changes operational state should pass through governance checks.

### Required rules

- unauthorized senders cannot initiate task creation
- critical tasks require approval before execution
- duplicate messages are suppressed through dedupe keys
- self-approval is blocked
- escalations require team owner + accountable lead
- sensitive attachments require evidence logging

This aligns with the maker-checker model already present in the backend and should trigger the same approval flow that exists for operational resolutions.

---

## 10. Deduplication and safety

Deduplication is essential to avoid generated loops or repeated action triggers.

### Standard dedupe keys

- channel + sourceMessageId
- normalized text hash
- attachment checksum
- linked task id
- issue id + action type + target team id

### Example rule

```ts
const dedupeKey = `${channel}:${sourceMessageId}:${hash(normalizedText)}:${attachmentChecksum || 'none'}`;
```

If the same dedupe key already exists in the message log, the message is ignored or merged into the existing thread.

---

## 11. Database model for messaging

The system should persist message events in a structured relational table model.

### Recommended tables

- `message_inbox`
- `message_outbox`
- `message_attachments`
- `message_intent_log`
- `task_message_links`
- `message_response_events`

### `message_inbox` example fields

- `id`
- `channel`
- `source_message_id`
- `conversation_id`
- `sender_id`
- `sender_name`
- `body`
- `normalized_body`
- `intent`
- `task_id`
- `issue_id`
- `team_id`
- `person_id`
- `status`
- `created_at`
- `processed_at`
- `dedupe_key`

This records the message as evidence and makes reporting possible later.

---

## 12. Message-to-task workflow

### Workflow sequence

```text
Incoming message
   ↓
Adapter normalization
   ↓
Message classification
   ↓
Duplicate detection
   ↓
Issue / task matching
   ↓
Attachment parsing / dataset extraction
   ↓
Task creation or update
   ↓
Governance check
   ↓
Workflow execution or approval trigger
   ↓
Reply sent back to channel
   ↓
Audit log persisted
```

This path ensures every action is structured and linked to evidence.

---

## 13. Channel-specific adapter design

### Email adapter

Responsibilities:
- listen to inbound SMTP or IMAP events
- parse headers, recipients, sender, subject, body
- detect attachments
- route messages to classification service
- send replies via email API

### Teams adapter

Responsibilities:
- consume webhook or bot messages
- map Teams conversation metadata to message envelope
- support thread-based follow-ups
- send replies in thread or channel context

### WhatsApp adapter

Responsibilities:
- receive bot or webhook events
- parse text and media attachments
- track real conversations and customer context
- route direct requests to task creation flow

### Telegram adapter

Responsibilities:
- receive bot messages and files
- maintain chat context and message thread states
- send operational updates to specific chats or users

---

## 14. Team-level and personal-level routing

### Team-level routing
Use when:
- message references a team or department
- the task is cross-functional
- the issue is blocked across multiple owners
- it requires escalation or shared review

### Personal routing
Use when:
- the issue is assigned to a user
- a follow-up is directed to a specific operator
- approval is for one reviewer

### Routing logic

```ts
if (task.assigneeId) {
  routeTo = 'person';
} else if (issue.teamId || escalation.required) {
  routeTo = 'team';
} else {
  routeTo = 'system';
}
```

This keeps responses targeted and prevents noisy broadcast messages.

---

## 15. Example scenarios

### Scenario A: Email with attachment

A user sends an email with a spreadsheet and text saying: “Please review these mismatched transactions and create a task.”

System behavior:
- email adapter normalizes the message
- attachment is classified as spreadsheet
- spreadsheet is parsed into rows
- task creation payload is prepared
- dataset is ingested into workflow task model
- workflow is started or pending approval based on configuration
- response is sent back to the original sender with task ID and status

### Scenario B: Teams message requesting update

A team lead asks: “What is the status of issue 204?”

System behavior:
- message is classified as status request
- issue lookup occurs
- status data is pulled from issue lifecycle and workflow state
- a direct Teams response is sent to the lead

### Scenario C: WhatsApp escalation

A support user sends a complaint with a customer reference and asks to escalate.

System behavior:
- message is classified as team escalation
- related issue or customer record is looked up
- escalation event is created
- appropriate team is assigned
- webhook notification is sent to the team room
- response is sent back to originator with escalation update

---

## 16. Recommended implementation sequence

### Phase 1: Common message contract

- define `MessageEnvelope`
- define `MessageSender`
- define message classification enums
- create message log tables

### Phase 2: Adapter skeletons

- build EmailAdapter
- build TeamsAdapter
- build WhatsAppAdapter
- build TelegramAdapter

### Phase 3: Rules and classification

- implement intent classifier
- implement duplicate detection
- implement issue/task matching logic

### Phase 4: Task creation flow

- attachment parsing
- dataset creation
- workflow triggering
- evidence attachment

### Phase 5: Response dispatch

- send personal replies
- send team notifications
- send approval requests
- send escalation updates

### Phase 6: Governance and audit

- approval enforcement
- event logging
- audit review
- SLA and operational reporting

---

## 17. Final recommendation

The clean implementation is not to build a special workflow for each messaging app.

Instead, add a channel-agnostic governance-based message platform with these layers:

- adapters
- normalization
- classification
- routing
- task creation
- approval / escalation
- outbound response
- audit trail

This fits naturally with the repository’s current architecture and allows the app to process requests and trigger tasks from email, Teams, WhatsApp, and Telegram in a consistent operational model.

This is the right integration model for a workflow-driven operational platform because it preserves control, safety, and traceability while still making communication channels feel native to the users working in them.
