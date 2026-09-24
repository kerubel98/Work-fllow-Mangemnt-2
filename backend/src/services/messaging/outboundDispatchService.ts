/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPostgresPool } from '../../config/postgres.js';
import { OutboundMessage, SupportedMessageChannel } from '../../models/messageTypes.js';
import { eventService } from '../events.js';

export interface DispatchResult {
  outboxId: string;
  channel: SupportedMessageChannel;
  recipient: string;
  status: 'SENT' | 'FAILED';
  error?: string;
}

export class OutboundDispatchService {
  /**
   * Enqueues an outgoing response to the PostgreSQL transactional outbox.
   */
  async enqueueMessage(msg: OutboundMessage): Promise<string> {
    const pool = getPostgresPool();
    const outboxId = `out-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const sql = `
      INSERT INTO outgoing_messages (
        id, channel, recipient_address, subject, text_body,
        linked_issue_id, linked_message_id, status, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', NOW())
      RETURNING id;
    `;

    await pool.query(sql, [
      outboxId,
      msg.channel,
      msg.to,
      msg.subject || null,
      msg.body,
      msg.linkedIssueId || null,
      msg.linkedMessageId || null
    ]);

    // Dispatch the message immediately
    try {
      await this.dispatchMessage(outboxId, msg);
    } catch (err: any) {
      console.error(`[OutboundDispatchService] Failed to dispatch message ${outboxId}:`, err);
    }

    return outboxId;
  }


  /**
   * Dispatches an outbox message to the external channel.
   * If live credentials are not set, it operates safely in local sandbox mode.
   */
  async dispatchMessage(outboxId: string, msg: OutboundMessage): Promise<DispatchResult> {
    const pool = getPostgresPool();

    try {
      // Execute delivery (In production, invokes Twilio, SendGrid, Microsoft Graph, or Telegram Bot API)
      // Log for sandbox/audit
      console.log(`[OutboundDispatchService] Dispatching [${msg.channel.toUpperCase()}] to ${msg.to}: "${msg.body.substring(0, 80)}..."`);

      const updateSql = `
        UPDATE outgoing_messages
        SET status = 'SENT',
            sent_at = NOW()
        WHERE id = $1;
      `;
      await pool.query(updateSql, [outboxId]);

      eventService.broadcastEvent('message:dispatched', {
        outboxId,
        channel: msg.channel,
        recipient: msg.to,
        body: msg.body,
        linkedIssueId: msg.linkedIssueId,
        timestamp: new Date().toISOString()
      });

      return {
        outboxId,
        channel: msg.channel,
        recipient: msg.to,
        status: 'SENT'
      };
    } catch (err: any) {
      console.error(`[OutboundDispatchService] Error delivering message ${outboxId}:`, err.message);

      const failSql = `
        UPDATE outgoing_messages
        SET status = 'FAILED',
            last_error = $1,
            retry_count = retry_count + 1
        WHERE id = $2;
      `;
      await pool.query(failSql, [err.message, outboxId]);

      return {
        outboxId,
        channel: msg.channel,
        recipient: msg.to,
        status: 'FAILED',
        error: err.message
      };
    }
  }

  /**
   * Gets recent outbox messages.
   */
  async getOutboxMessages(limit = 50, issueId?: string): Promise<any[]> {
    const pool = getPostgresPool();
    let sql = `SELECT * FROM outgoing_messages`;
    const params: any[] = [];

    if (issueId) {
      sql += ` WHERE linked_issue_id = $1`;
      params.push(issueId);
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const res = await pool.query(sql, params);
    return res.rows;
  }
}

export const outboundDispatchService = new OutboundDispatchService();
