/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { queryPg, isPostgresConnected } from '../config/postgres.js';
import { eventService } from './events.js';
import { approvalService } from './approvalService.js';

export type EscalationActionType = 
  | 'ESCALATE_ISSUE' 
  | 'RUN_SANDBOX' 
  | 'REQUEST_APPROVAL' 
  | 'REASSIGN_OWNER' 
  | 'CLOSE_ESCALATION';

export type EscalationStatus = 
  | 'NEW' 
  | 'RECOMMENDED' 
  | 'ACCEPTED' 
  | 'IN_PROGRESS' 
  | 'RESOLVED' 
  | 'CLOSED' 
  | 'REJECTED';

export interface EscalationEvent {
  id: string;
  issueId: string;
  teamId?: string;
  actionType: EscalationActionType;
  status: EscalationStatus;
  idempotencyKey?: string;
  actorId?: string;
  actorName?: string;
  reason?: string;
  payload: Record<string, any>;
  createdAt: string;
  resolvedAt?: string;
}

export interface ExecuteCommandInput {
  issueId: string;
  actionType: EscalationActionType;
  targetTeamId?: string;
  reason?: string;
  actorId: string;
  actorName: string;
  idempotencyKey?: string;
  payload?: Record<string, any>;
}

export const escalationService = {
  /**
   * Fetches escalation events for an issue.
   */
  async getEscalationsForIssue(issueId: string): Promise<EscalationEvent[]> {
    if (!isPostgresConnected) return [];

    const res = await queryPg(
      `SELECT * FROM escalation_events WHERE issue_id = $1 ORDER BY created_at DESC`,
      [issueId]
    );

    return res.rows.map(r => ({
      id: r.id,
      issueId: r.issue_id,
      teamId: r.team_id,
      actionType: r.action_type,
      status: r.status,
      idempotencyKey: r.idempotency_key,
      actorId: r.actor_id,
      actorName: r.actor_name,
      reason: r.reason,
      payload: r.payload || {},
      createdAt: r.created_at,
      resolvedAt: r.resolved_at
    }));
  },

  /**
   * Executes a structured action command with idempotency deduplication.
   */
  async executeActionCommand(input: ExecuteCommandInput): Promise<{
    event: EscalationEvent;
    duplicateSuppressed: boolean;
    outputMessage: string;
  }> {
    if (!input.issueId || !input.actionType || !input.actorId) {
      throw new Error('issueId, actionType, and actorId are required.');
    }

    const eventId = `esc-ev-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    // 1. Idempotency Check
    if (input.idempotencyKey) {
      const existing = await queryPg(
        `SELECT * FROM escalation_events WHERE idempotency_key = $1 LIMIT 1`,
        [input.idempotencyKey]
      );

      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        return {
          event: {
            id: row.id,
            issueId: row.issue_id,
            teamId: row.team_id,
            actionType: row.action_type,
            status: row.status,
            idempotencyKey: row.idempotency_key,
            actorId: row.actor_id,
            actorName: row.actor_name,
            reason: row.reason,
            payload: row.payload || {},
            createdAt: row.created_at,
            resolvedAt: row.resolved_at
          },
          duplicateSuppressed: true,
          outputMessage: `Duplicate command suppressed: action '${input.actionType}' was already executed with this key.`
        };
      }
    }

    let initialStatus: EscalationStatus = 'NEW';
    let outputMessage = `Command '${input.actionType}' staged successfully.`;

    // 2. Action Execution
    if (input.actionType === 'ESCALATE_ISSUE') {
      initialStatus = 'ACCEPTED';
      const targetTeam = input.targetTeamId || 'general';

      await queryPg(
        `UPDATE issues 
         SET escalated_to_team_id = $1, 
             escalation_reason = $2, 
             escalated_at = NOW(), 
             status = 'IN_PROGRESS' 
         WHERE id = $3`,
        [targetTeam, input.reason || 'Escalated via Incident Room', input.issueId]
      );

      outputMessage = `Issue ${input.issueId} escalated to team [${targetTeam}].`;
      eventService.broadcastEvent('issue:escalated', {
        issueId: input.issueId,
        targetTeamId: targetTeam,
        reason: input.reason
      });
    } else if (input.actionType === 'REQUEST_APPROVAL') {
      initialStatus = 'IN_PROGRESS';
      
      const proposal = await approvalService.submitProposal({
        type: 'WORKSPACE_SETTING',
        settingKey: `issue_resolution_${input.issueId}`,
        title: `Resolution Proposal for ${input.issueId}`,
        teamId: input.targetTeamId || 'general',
        makerId: input.actorId,
        makerName: input.actorName,
        justification: input.reason || 'Proposed resolution staged via Escalation Room.',
        proposedChanges: input.payload || { issueId: input.issueId, action: 'RESOLUTION_PROPOSAL' }
      });

      outputMessage = `Maker proposal [${proposal.id}] registered. Locked to PENDING_CHECKER_REVIEW.`;
    } else if (input.actionType === 'CLOSE_ESCALATION') {
      initialStatus = 'CLOSED';
      await queryPg(
        `UPDATE escalation_events 
         SET status = 'CLOSED', resolved_at = NOW() 
         WHERE issue_id = $1 AND status != 'CLOSED'`,
        [input.issueId]
      );
      outputMessage = `Escalation room for ${input.issueId} closed.`;
    }

    // 3. Persist Escalation Event in PostgreSQL
    const insertRes = await queryPg(
      `INSERT INTO escalation_events (
        id, issue_id, team_id, action_type, status, idempotency_key, actor_id, actor_name, reason, payload, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
      RETURNING *;`,
      [
        eventId,
        input.issueId,
        input.targetTeamId || null,
        input.actionType,
        initialStatus,
        input.idempotencyKey || null,
        input.actorId,
        input.actorName,
        input.reason || null,
        JSON.stringify(input.payload || {}),
        nowIso
      ]
    );

    const r = insertRes.rows[0];
    const event: EscalationEvent = {
      id: r.id,
      issueId: r.issue_id,
      teamId: r.team_id,
      actionType: r.action_type,
      status: r.status,
      idempotencyKey: r.idempotency_key,
      actorId: r.actor_id,
      actorName: r.actor_name,
      reason: r.reason,
      payload: r.payload || {},
      createdAt: r.created_at,
      resolvedAt: r.resolved_at
    };

    eventService.broadcastEvent('escalation:command_executed', event);

    return {
      event,
      duplicateSuppressed: false,
      outputMessage
    };
  },

  /**
   * Transitions an escalation event's lifecycle status.
   */
  async transitionStatus(eventId: string, newStatus: EscalationStatus): Promise<EscalationEvent> {
    const isResolved = newStatus === 'RESOLVED' || newStatus === 'CLOSED';
    const res = await queryPg(
      `UPDATE escalation_events 
       SET status = $1, 
           resolved_at = CASE WHEN $2 = true THEN NOW() ELSE resolved_at END 
       WHERE id = $3 
       RETURNING *`,
      [newStatus, isResolved, eventId]
    );

    if (res.rows.length === 0) {
      throw new Error(`Escalation event '${eventId}' not found.`);
    }

    const r = res.rows[0];
    const event: EscalationEvent = {
      id: r.id,
      issueId: r.issue_id,
      teamId: r.team_id,
      actionType: r.action_type,
      status: r.status,
      idempotencyKey: r.idempotency_key,
      actorId: r.actor_id,
      actorName: r.actor_name,
      reason: r.reason,
      payload: r.payload || {},
      createdAt: r.created_at,
      resolvedAt: r.resolved_at
    };

    eventService.broadcastEvent('escalation:status_changed', event);
    return event;
  }
};
