# Implementation Plan: Active Mailbox IMAP Poller & Automated Ingestion Engine

## Objective

Design an automated, active mailbox connector for the Back Office Workflow Platform. Rather than relying solely on push webhooks, the system will actively authenticate with mail servers (IMAP, Gmail, Microsoft 365 Exchange, corporate SMTP/IMAP servers) on a configurable schedule, fetch unread emails and attachments, normalize them through `messageIntakeService`, and trigger task creation, escalation, or Maker-Checker approval flows without human intervention.

This design strictly complies with [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md):
- Zero unapproved infrastructure (No Kafka, No Redis, No Celery).
- Scheduled execution is synchronized via **64-bit cryptographic PostgreSQL advisory locks** to prevent concurrent overlapping pollers across worker nodes.
- Preserves Anti-Self-Approval (`makerId !== checkerId`) and dataset column mapping standards.

---

## 1. Architectural Overview

```
      Corporate Mail Server (Gmail / Outlook 365 / Corporate IMAP)
                                    │
                                    │ IMAP/TLS (Host, Port, User, Pass/OAuth)
                                    ▼
                     [ActiveMailboxPollerService]
                                    │
                     [64-Bit Advisory Lock: mailbox_${id}]
                       - Prevents concurrent polling runs
                       - Respects configured interval (e.g. 5m)
                                    │
                                    ▼
                         [IMAP Client Worker]
                       - Connects & authenticates securely
                       - Searches for UNSEEN messages
                       - Fetches headers, MIME body, attachments
                                    │
                                    ▼
                       [MIME & Attachment Parser]
                       - Extracts plain text & HTML
                       - Detects CSV / XLSX / PDF / Images
                       - Computes attachment checksums
                                    │
                                    ▼
                       [messageIntakeService.processEnvelope()]
                       - 64-Bit Deduplication (dedupe_key)
                       - Sender Identity Resolution
                       - Intent Classification (TASK, ESCALATION, APPROVAL)
                       - Anti-Self-Approval Enforcement
                                    │
                                    ▼
                         [Post-Fetch Mail Action]
                       - Flags email as \Seen
                       - Optional: Moves to configured Archive folder
                                    │
                                    ▼
                       [PostgreSQL Audit & Outbox]
                       - Records poll heartbeat in `mailbox_poll_logs`
                       - Dispatches outbound confirmation via `outgoing_messages`
```

---

## 2. Proposed Changes & Technical Specifications

### Component 1: Database Migration `018_mailbox_polling_configurations.sql`

#### Table: `team_mailbox_configurations`
Stores the server connection credentials and polling schedules for team-level active mailboxes:
```sql
CREATE TABLE IF NOT EXISTS team_mailbox_configurations (
    id VARCHAR(64) PRIMARY KEY,
    team_id VARCHAR(64) NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    display_name VARCHAR(128) NOT NULL,
    protocol VARCHAR(32) NOT NULL DEFAULT 'IMAP', -- 'IMAP' | 'POP3' | 'GRAPH_API'
    host VARCHAR(255) NOT NULL,                   -- e.g. imap.gmail.com, outlook.office365.com
    port INT NOT NULL DEFAULT 993,
    secure BOOLEAN DEFAULT true,                   -- TLS/SSL
    username VARCHAR(255) NOT NULL,
    encrypted_password TEXT NOT NULL,              -- AES-256-GCM encrypted at rest
    mailbox_folder VARCHAR(64) DEFAULT 'INBOX',
    archive_folder VARCHAR(64),                    -- Optional: e.g. 'Archive' or 'Processed'
    poll_interval_minutes INT DEFAULT 5,
    fetch_filter VARCHAR(32) DEFAULT 'UNSEEN',     -- 'UNSEEN' | 'ALL'
    is_active BOOLEAN DEFAULT true,
    last_polled_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    consecutive_failures INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mailbox_team ON team_mailbox_configurations(team_id);
CREATE INDEX IF NOT EXISTS idx_mailbox_active ON team_mailbox_configurations(is_active);
```

#### Table: `mailbox_poll_logs`
Detailed audit log of every fetch cycle for operational transparency:
```sql
CREATE TABLE IF NOT EXISTS mailbox_poll_logs (
    id VARCHAR(64) PRIMARY KEY,
    mailbox_id VARCHAR(64) NOT NULL REFERENCES team_mailbox_configurations(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL, -- 'SUCCESS' | 'FAILED' | 'EMPTY'
    messages_detected INT DEFAULT 0,
    messages_processed INT DEFAULT 0,
    messages_skipped INT DEFAULT 0,
    error_message TEXT,
    duration_ms INT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poll_logs_mailbox ON mailbox_poll_logs(mailbox_id, created_at DESC);
```

---

### Component 2: Backend Services

#### 1. Credential Encryption Utility (`backend/src/utils/credentialCrypto.ts`)
- Symmetric AES-256-GCM encryption/decryption using an application master secret (`process.env.APP_ENCRYPTION_KEY`).
- Ensures plain-text passwords and App Passwords are never exposed in logs or PostgreSQL dumps.

#### 2. IMAP Fetcher & Parser (`backend/src/services/messaging/imapClient.ts`)
- Uses lightweight, robust native Node.js IMAP parsing (`node-imap` or `imapflow` + `mailparser`).
- Connects using TLS v1.2+, selects the target folder (`INBOX`), and searches by criteria (`UNSEEN`).
- Parses RFC 822 / MIME multipart structures:
  - Extracts `From:`, `To:`, `Cc:`, `Subject:`, `Date:`, `Message-ID`.
  - Extracts text bodies and HTML bodies.
  - Streams binary attachments (CSV, XLSX, PDF, PNG) directly into buffers/checksums.
- Marks processed emails with flag `\Seen` (or copies to `archive_folder` if configured) so emails are never processed twice.

#### 3. Active Mailbox Poller Service (`backend/src/services/messaging/activeMailboxPollerService.ts`)
- **64-bit Advisory Locking**:
  Before polling a mailbox, acquires:
  ```sql
  SELECT pg_try_advisory_lock(('x' || substr(md5('mailbox_poll_' || $1), 1, 16))::bit(64)::bigint);
  ```
  If another cluster instance or thread is currently polling this mailbox, skips gracefully to eliminate race conditions.
- **Normalization to Canonical Contract**:
  Converts each fetched email into our canonical `MessageEnvelope` and passes it directly to `messageIntakeService.processEnvelope()`.
- **Automated Scheduling**:
  A lightweight in-process interval runner checks active configurations every 60 seconds. If `NOW() - last_polled_at >= poll_interval_minutes`, triggers the poll cycle.
- **Circuit Breaker / Exponential Backoff**:
  If a mailbox fails authentication 5 consecutive times, sets `is_active = false`, logs an operational alert, and sends an in-app notification to the Team Manager.

---

### Component 3: API Routes (`backend/src/routes/messages.ts`)

- `GET /api/messages/mailboxes/team/:teamId`: Lists configured mailboxes for a team (passwords masked).
- `POST /api/messages/mailboxes/team`: Creates or updates mailbox credentials and polling schedule.
- `POST /api/messages/mailboxes/:id/test-connection`: Performs a real-time IMAP ping without fetching emails to verify host, port, and credentials.
- `POST /api/messages/mailboxes/:id/poll-now`: Triggers an immediate manual poll cycle.
- `GET /api/messages/mailboxes/:id/logs`: Retrieves recent polling history and error logs.

---

### Component 4: Frontend UI Integration

#### 1. Mailbox Configuration Modal in `TeamChannelsTab.tsx`
- **Fields**: Server Protocol (`IMAP`), Server Host (`imap.gmail.com`), Port (`993`), SSL/TLS toggle, Username/Email, App Password, Mailbox Folder (`INBOX`), Poll Interval slider (1–60 minutes).
- **Test Connection Button**: Pings the server and shows a green checkmark or specific auth error (e.g., "Invalid credentials", "Connection timed out", "App Password required").
- **Poll Now Button**: Allows operators to immediately pull latest emails on demand.
- **Audit Log Drawer**: Shows timestamped history of previous poll cycles, count of detected messages, and processing outcomes.

---

## 3. Governance & Safety Rules

1. **Maker-Checker Anti-Self-Approval**:
   Emails received through the active poller attempting to execute `@approve` or `APPROVAL_REQUEST` are resolved against `user_id`. Anti-Self-Approval strictly blocks operators from approving their own proposals via email.
2. **Dataset Mapping Safety**:
   Spreadsheet/CSV attachments pulled from mailboxes with unmapped headers create an `Issue` in `dataset_status = 'PENDING_MAPPING'`. Operators must confirm or map columns in `IssueDetailView` before automated SQL pipelines execute.
3. **Idempotency Guarantee**:
   Both the email `Message-ID` header and payload hash are used to derive `dedupe_key`. Even if an email remains unflagged on the mail server, PostgreSQL's `dedupe_key UNIQUE` constraint prevents duplicate task creations.

---

## 4. Verification Plan (When Executed Later)

### Automated Test Suite (`backend/src/services/__tests__/activeMailboxPoller.test.ts`)
1. **Mock IMAP Server Test**: Run a mock IMAP daemon in Vitest to simulate incoming emails with CSV attachments.
2. **Advisory Locking Test**: Confirm two simultaneous poll calls on the same mailbox do not execute concurrently.
3. **Deduplication Test**: Ensure fetching the same email twice results in `DUPLICATE_IGNORED`.
4. **MIME Extraction Test**: Verify extraction of subject, sender, body, and CSV attachment buffers.
5. **AES-256 Encryption Test**: Verify passwords cannot be recovered without the encryption secret.

### Manual Verification
1. Configure a live Gmail / Outlook test mailbox using an App Password.
2. Click "Test Connection" in Team Settings and verify successful authentication.
3. Send an email with a reconciliation CSV attachment to the mailbox.
4. Verify the email is marked as read, a task is created in the team queue, and a confirmation reply appears in the transactional outbox.
