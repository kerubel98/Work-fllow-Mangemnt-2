# Engineering Implementation Plan: Inter-Team Escalation Agreement Lifecycle & Screens 27–32

**Document Version**: 1.0.0  
**Target Architecture**: Back-Office Settlement & Operational Workflow Management  
**Governance Standard**: [`bo-operational-governance`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/.agents/skills/bo-operational-governance/SKILL.md) & [`AGENTS.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/AGENTS.md)  
**Specification Source**: [`redesigned_ui/new-redsign/fllow-discription.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/redesigned_ui/new-redsign/fllow-discription.md)  
**Master Index Entry**: [`MASTER_ARCHITECTURE_INDEX.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md) (Domain 9: Inter-Team Escalations & Bilateral Agreements)

---

## 1. Executive Summary & Objective

This implementation plan governs the physical engineering, PostgreSQL persistence, and visual verification of the **Inter-Team Escalation Flow (Screens 27 through 32)** as designed in `redesigned_ui/new-redsign/`:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        INTER-TEAM ESCALATION LIFECYCLE FLOW                            │
│                                                                                        │
│  [Screen 27: Case Discussion Drawer]                                                   │
│    │  • Slide-over consensus hub on active case (e.g. ISS-3854)                        │
│    │  • Top summary bar with "🏳 Escalate" action                                       │
│    │  • Distinct orange escalated callout card with SLA chips & "Open room →"           │
│    ▼                                                                                   │
│  [Screen 28: In-Chat Directives Popover]                                               │
│    │  • Autocomplete popover triggered by "/"                                          │
│    │  • Highlighting "/create-escalate" (Escalate to team under signed agreement)       │
│    ▼                                                                                   │
│  [Screen 29: Escalate to Team Modal]                                                   │
│    │  • Team picker, reason, priority (Medium/High/Critical)                           │
│    │  • Case payload traveler toggles (Summary, Workflow, Flagged rows, Chat history)   │
│    │  • Agreed KPIs builder + 4-step milestone stepper (Raised → Sign → Accept → Open) │
│    ▼                                                                                   │
│  [Screen 30: Room — Escalating Team Perspective]                                       │
│    │  • Collaborative Team Discussion room (permanent audit record)                    │
│    │  • Escalating lead assigns Checker (@checker_ops_2) & signs first                 │
│    ▼                                                                                   │
│  [Screen 31: Room — Receiving Team Perspective]                                        │
│    │  • Receiving team lead reviews KPIs ("The clock starts when you accept")          │
│    │  • Receiving lead assigns Technician (@samuel_tech) & accepts                     │
│    ▼                                                                                   │
│  [Screen 32: Formal Signed Escalation Agreement View]                                  │
│    │  • Co-signed contract with electronic signatures (manager_alex & tech_sarah)       │
│    │  • Case & roles matrix, live KPI progress tracking, and locked terms policy       │
│    │  • Immutable chronological ledger of events and permanent participants            │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Core Architectural & Governance Compliance

1. **Rule 23 (PostgreSQL-First & Zero LocalStorage)**:
   - Full persistence in PostgreSQL via `036_escalation_agreements.sql`. All agreement terms, status transitions, signatures, KPI progress, and ledger entries must be queryable and auditable.
2. **Rule 7 & ADR-001 (Maker-Checker & Role Separation)**:
   - Escalating Lead assigns an internal **Checker** and signs.
   - Receiving Lead assigns an operational **Technician** and accepts.
   - Separation of powers: `escalatingLeadId !== receivingLeadId` and `technicianId !== checkerId`.
3. **KPI Clock Governance**:
   - The SLA countdown strictly starts when the receiving team lead **accepts** the agreement (`clock_started_at`).
4. **Rule 16 (Full-Viewport Flexbox & Density)**:
   - Preserves `html { zoom: 0.8; }` and strict flexbox containment (`overflow-hidden`, `min-h-0`).

---

## 3. Relational Schema & Migration Design (Phase 1)

### Migration: `036_escalation_agreements.sql`
```sql
CREATE TABLE IF NOT EXISTS escalation_agreements (
    id VARCHAR(64) PRIMARY KEY,
    issue_id VARCHAR(64) REFERENCES issues(id) ON DELETE CASCADE,
    escalating_team_id VARCHAR(64) REFERENCES teams(id),
    receiving_team_id VARCHAR(64) REFERENCES teams(id),
    status VARCHAR(32) NOT NULL DEFAULT 'AWAITING_ESCALATING_SIGNATURE',
    priority VARCHAR(16) NOT NULL DEFAULT 'High',
    reason TEXT NOT NULL,
    workflow_id VARCHAR(64),
    workflow_name VARCHAR(255),
    flagged_count INT DEFAULT 0,
    total_count INT DEFAULT 0,
    escalating_lead_id VARCHAR(64),
    escalating_lead_signature VARCHAR(128),
    escalating_signed_at TIMESTAMP WITH TIME ZONE,
    assigned_checker_id VARCHAR(64),
    receiving_lead_id VARCHAR(64),
    receiving_lead_signature VARCHAR(128),
    receiving_accepted_at TIMESTAMP WITH TIME ZONE,
    assigned_technician_id VARCHAR(64),
    kpis JSONB DEFAULT '[]'::jsonb,
    payload_options JSONB DEFAULT '{}'::jsonb,
    ledger JSONB DEFAULT '[]'::jsonb,
    clock_started_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_esc_agreements_issue ON escalation_agreements(issue_id);
CREATE INDEX IF NOT EXISTS idx_esc_agreements_teams ON escalation_agreements(escalating_team_id, receiving_team_id);
CREATE INDEX IF NOT EXISTS idx_esc_agreements_status ON escalation_agreements(status);
```

---

## 4. Backend Service & API Layer (Phase 2)

### Endpoints in `/api/escalations`
* `GET /api/escalations/agreements` — List agreements (filter by `teamId`, `issueId`, `status`).
* `GET /api/escalations/agreements/:id` — Get full agreement details, signatures, live KPIs, and ledger.
* `POST /api/escalations/agreements` — Create new escalation proposal (Screen 29 submission).
* `POST /api/escalations/agreements/:id/sign-escalating` — Escalating lead signs and assigns checker (Screen 30).
* `POST /api/escalations/agreements/:id/accept-receiving` — Receiving lead accepts, assigns technician, and starts KPI clock (Screen 31).
* `POST /api/escalations/agreements/:id/decline-receiving` — Receiving lead declines with mandatory justification.
* `POST /api/escalations/agreements/:id/ledger-event` — Append immutable event or message to the room ledger.

---

## 5. Frontend Component Engineering (Phase 3)

### Screen 27: `CaseDiscussionDrawer.tsx`
* Positioned as a high-density slide-over drawer on active cases (`CasesWorkspaceView.tsx`).
* Case summary header with badge, metadata, and `🏳 Escalate` action.
* Orange callout card showing active escalation status with `Open escalation room →` route trigger.
* Autocomplete chips for `@people` and `@@teams`.

### Screen 28: `UnifiedChatInput.tsx` Directive Extension
* Update autocomplete to render the exact 4 directives:
  1. `/create-task` — [Task action] Create an operational investigation task from this thread
  2. `/create-escalate` — [Escalate to team] Hand this case to another team under a signed agreement
  3. `/create-hashtag` — [Automation] Define a new universal hashtag automation preset
  4. `/call-hashtag` — [Workflow] Search and attach an existing registered #hashtag rule

### Screen 29: `EscalateToTeamModal.tsx`
* High-fidelity modal matching `29_escalate_to_team.png`:
  * Selectable team cards with member/lead details and orange border.
  * Reason textarea and priority pills (`Medium`, `High`, `Critical`).
  * Send with case multi-select toggles (`Investigation summary`, `Workflow & run result`, `24 flagged rows`, `Chat history`).
  * Dynamic KPI target builder with `+ Add KPI`.
  * Right-hand 4-step vertical progress stepper and shared workflow badge card.

### Screens 30 & 31: `TeamDiscussionTab.tsx` / `EscalationRoomView.tsx`
* 3-column operational layout matching `30_room_escalating_team.png` and `31_room_receiving_team.png`:
  * Left: Rooms list (`# core-operations-general`, `⚑ ISS-3854 · trn test` with active status badge).
  * Center: Room audit banner, escalation callout card, thread, and message bar.
  * Right: Dedicated agreement panel switching between Escalating Lead perspective (assign checker + sign) and Receiving Lead perspective (review KPIs, notice that clock starts, assign technician + accept/decline).

### Screen 32: `EscalationAgreementView.tsx`
* Full-screen view at route `activeNavigation === 'escalation_agreement'` or 1-click modal from room:
  * Co-signatures with electronic script typography (`manager_alex`, `tech_sarah`) and UTC timestamps.
  * Case and roles matrix (`Workflow used`, `Technician`, `Checker`).
  * KPI terms live progress table with actual elapsed time and status pills (`Met`, `Running`, `Not measured`).
  * Permanent ledger timeline and participants on record.

---

## 6. Visual Verification via Puppeteer MCP (Phase 4)

Using `puppeteer_navigate` and `puppeteer_screenshot`:
* Capture live screenshots of all 6 views on `http://localhost:3000`:
  1. `screen_27_case_discussion_verified.png`
  2. `screen_28_slash_commands_verified.png`
  3. `screen_29_escalate_to_team_verified.png`
  4. `screen_30_room_escalating_team_verified.png`
  5. `screen_31_room_receiving_team_verified.png`
  6. `screen_32_escalation_agreement_verified.png`
* Visually compare against reference images in `redesigned_ui/new-redsign/`.

---

## 7. Acceptance & Audit Sign-Off (Phase 5)
* Author [`ESCALATION_AGREEMENT_ACCEPTANCE_REPORT.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/ESCALATION_AGREEMENT_ACCEPTANCE_REPORT.md).
* Update [`MASTER_ARCHITECTURE_INDEX.md`](file:///c:/Users/hp/Downloads/opration-workflow-mangement1/MASTER_ARCHITECTURE_INDEX.md) under Domain 9.
* Verify 100% clean test suite (`npm test`) and 0-error TypeScript build (`npm run lint` & `npm run build`).
