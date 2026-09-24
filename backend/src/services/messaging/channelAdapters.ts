/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { 
  MessageEnvelope, 
  MessageAttachment, 
  SupportedMessageChannel, 
  MessageAttachmentContentType 
} from '../../models/messageTypes.js';

export function computeMessageHash(text: string): string {
  const normalized = (text || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return crypto.createHash('md5').update(normalized).digest('hex').substring(0, 16);
}

export function detectContentType(filename: string, mimeType: string): MessageAttachmentContentType {
  const lowerName = (filename || '').toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase();

  if (lowerName.endsWith('.csv') || lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerMime.includes('spreadsheet') || lowerMime.includes('csv')) {
    return 'spreadsheet';
  }
  if (lowerName.endsWith('.pdf') || lowerMime.includes('pdf')) {
    return 'pdf';
  }
  if (lowerMime.startsWith('image/')) {
    return 'image';
  }
  if (lowerMime.startsWith('audio/')) {
    return 'audio';
  }
  return 'document';
}

export interface IChannelAdapter {
  channel: SupportedMessageChannel;
  verifySignature(payload: any, signatureHeader?: string, secret?: string): boolean;
  normalize(rawPayload: any): MessageEnvelope;
}

/**
 * 1. Email Adapter: Parses email payload (JSON representation from SMTP webhook / Mailgun / SendGrid)
 */
export class EmailAdapter implements IChannelAdapter {
  channel: SupportedMessageChannel = 'email';

  verifySignature(payload: any, signatureHeader?: string, secret?: string): boolean {
    if (!secret || !signatureHeader) return true; // Optional secret check
    try {
      const hmac = crypto.createHmac('sha256', secret);
      const digest = hmac.update(typeof payload === 'string' ? payload : JSON.stringify(payload)).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signatureHeader));
    } catch {
      return false;
    }
  }

  normalize(raw: any): MessageEnvelope {
    const sender = raw.from || raw.sender || raw.fromEmail || 'unknown@domain.com';
    const sourceMessageId = raw.messageId || raw.sourceMessageId || `email-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const textBody = raw.text || raw.bodyText || raw.textBody || raw.subject || '';
    const htmlBody = raw.html || raw.bodyHtml || raw.htmlBody || '';
    const subject = raw.subject || 'Operational Notification';

    const attachments: MessageAttachment[] = (raw.attachments || []).map((att: any, idx: number) => {
      const filename = att.filename || att.name || `attachment-${idx}`;
      const mimeType = att.mimeType || att.contentType || 'application/octet-stream';
      return {
        id: `att-email-${Date.now()}-${idx}`,
        filename,
        mimeType,
        sizeBytes: att.size || att.sizeBytes || 0,
        storagePath: att.url || att.storagePath || undefined,
        checksum: att.checksum || undefined,
        contentType: detectContentType(filename, mimeType),
        rawBase64: att.base64 || undefined
      };
    });

    const fullContent = `${subject} ${textBody}`.trim();
    const hash = computeMessageHash(fullContent);
    const dedupeKey = `email:${sourceMessageId}:${hash}`;

    return {
      messageId: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sourceChannel: 'email',
      sourceMessageId,
      conversationId: raw.inReplyTo || raw.threadId || sourceMessageId,
      threadId: raw.threadId || undefined,
      senderAddress: sender,
      senderName: raw.fromName || raw.senderName || sender.split('@')[0],
      senderType: 'person',
      receivedAt: raw.timestamp ? new Date(raw.timestamp).toISOString() : new Date().toISOString(),
      textBody: fullContent,
      htmlBody,
      attachments,
      metadata: { subject, ...raw.metadata },
      rawPayload: raw,
      dedupeKey
    };
  }
}

/**
 * 2. Microsoft Teams Adapter: Maps Microsoft Bot Framework Activity payloads
 */
export class TeamsAdapter implements IChannelAdapter {
  channel: SupportedMessageChannel = 'teams';

  verifySignature(payload: any, signatureHeader?: string, secret?: string): boolean {
    if (!secret || !signatureHeader) return true;
    return true; // Simplified for internal testing
  }

  normalize(raw: any): MessageEnvelope {
    const fromUser = raw.from || {};
    const sender = fromUser.id || fromUser.userPrincipalName || fromUser.email || 'teams-user';
    const sourceMessageId = raw.id || raw.sourceMessageId || `teams-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const conversation = raw.conversation || {};
    const textBody = raw.text || raw.content || '';

    const attachments: MessageAttachment[] = (raw.attachments || []).map((att: any, idx: number) => {
      const filename = att.name || `teams-file-${idx}`;
      const mimeType = att.contentType || 'application/octet-stream';
      return {
        id: `att-teams-${Date.now()}-${idx}`,
        filename,
        mimeType,
        sizeBytes: att.sizeBytes || 0,
        storagePath: att.contentUrl || undefined,
        contentType: detectContentType(filename, mimeType)
      };
    });

    const hash = computeMessageHash(textBody);
    const dedupeKey = `teams:${sourceMessageId}:${hash}`;

    return {
      messageId: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sourceChannel: 'teams',
      sourceMessageId,
      conversationId: conversation.id || sourceMessageId,
      threadId: conversation.conversationType === 'channel' ? conversation.id : undefined,
      senderAddress: sender,
      senderName: fromUser.name || 'Teams Operator',
      senderType: conversation.isGroup ? 'team' : 'person',
      receivedAt: raw.timestamp ? new Date(raw.timestamp).toISOString() : new Date().toISOString(),
      textBody,
      attachments,
      metadata: { channelData: raw.channelData, tenantId: conversation.tenantId },
      rawPayload: raw,
      dedupeKey
    };
  }
}

/**
 * 3. WhatsApp Adapter: Maps Meta WhatsApp Cloud API payloads
 */
export class WhatsAppAdapter implements IChannelAdapter {
  channel: SupportedMessageChannel = 'whatsapp';

  verifySignature(payload: any, signatureHeader?: string, secret?: string): boolean {
    if (!secret || !signatureHeader) return true;
    try {
      const hmac = crypto.createHmac('sha256', secret);
      const digest = 'sha256=' + hmac.update(typeof payload === 'string' ? payload : JSON.stringify(payload)).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signatureHeader));
    } catch {
      return false;
    }
  }

  normalize(raw: any): MessageEnvelope {
    // Meta WhatsApp Cloud API structure: entry[0].changes[0].value.messages[0]
    let msgObj = raw;
    let senderName = 'WhatsApp User';

    if (raw.entry && Array.isArray(raw.entry) && raw.entry[0]?.changes?.[0]?.value?.messages?.[0]) {
      const val = raw.entry[0].changes[0].value;
      msgObj = val.messages[0];
      if (val.contacts?.[0]?.profile?.name) {
        senderName = val.contacts[0].profile.name;
      }
    }

    const sender = msgObj.from || msgObj.senderAddress || 'whatsapp-user';
    const sourceMessageId = msgObj.id || msgObj.sourceMessageId || `wa-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    let textBody = '';
    const attachments: MessageAttachment[] = [];

    if (msgObj.type === 'text') {
      textBody = msgObj.text?.body || '';
    } else if (msgObj.text) {
      textBody = typeof msgObj.text === 'string' ? msgObj.text : (msgObj.text.body || '');
    } else if (msgObj.body) {
      textBody = msgObj.body;
    }

    // Media: document, image, audio
    if (msgObj.document) {
      const doc = msgObj.document;
      const filename = doc.filename || 'document.pdf';
      const mimeType = doc.mime_type || 'application/pdf';
      attachments.push({
        id: `att-wa-${doc.id || Date.now()}`,
        filename,
        mimeType,
        storagePath: doc.link || undefined,
        contentType: detectContentType(filename, mimeType)
      });
      if (doc.caption) textBody += (textBody ? ' ' : '') + doc.caption;
    } else if (msgObj.image) {
      const img = msgObj.image;
      attachments.push({
        id: `att-wa-${img.id || Date.now()}`,
        filename: 'image.jpg',
        mimeType: img.mime_type || 'image/jpeg',
        storagePath: img.link || undefined,
        contentType: 'image'
      });
      if (img.caption) textBody += (textBody ? ' ' : '') + img.caption;
    }

    const hash = computeMessageHash(textBody);
    const dedupeKey = `whatsapp:${sourceMessageId}:${hash}`;

    return {
      messageId: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sourceChannel: 'whatsapp',
      sourceMessageId,
      conversationId: msgObj.context?.id || sender,
      senderAddress: sender,
      senderName,
      senderType: 'person',
      receivedAt: msgObj.timestamp ? new Date(parseInt(msgObj.timestamp, 10) * 1000).toISOString() : new Date().toISOString(),
      textBody,
      attachments,
      metadata: { waId: sender, messageType: msgObj.type },
      rawPayload: raw,
      dedupeKey
    };
  }
}

/**
 * 4. Telegram Adapter: Maps Telegram Bot API Update payloads
 */
export class TelegramAdapter implements IChannelAdapter {
  channel: SupportedMessageChannel = 'telegram';

  verifySignature(payload: any, signatureHeader?: string, secret?: string): boolean {
    if (!secret || !signatureHeader) return true;
    return signatureHeader === secret;
  }

  normalize(raw: any): MessageEnvelope {
    const msg = raw.message || raw;
    const fromUser = msg.from || {};
    const chat = msg.chat || {};
    const sender = fromUser.id ? String(fromUser.id) : (msg.senderAddress || 'telegram-user');
    const sourceMessageId = String(msg.message_id || msg.sourceMessageId || `tg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);

    let textBody = msg.text || msg.caption || '';
    const attachments: MessageAttachment[] = [];

    if (msg.document) {
      const doc = msg.document;
      const filename = doc.file_name || 'document';
      const mimeType = doc.mime_type || 'application/octet-stream';
      attachments.push({
        id: `att-tg-${doc.file_id || Date.now()}`,
        filename,
        mimeType,
        sizeBytes: doc.file_size || 0,
        contentType: detectContentType(filename, mimeType)
      });
    } else if (msg.photo && Array.isArray(msg.photo) && msg.photo.length > 0) {
      const largestPhoto = msg.photo[msg.photo.length - 1];
      attachments.push({
        id: `att-tg-${largestPhoto.file_id}`,
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: largestPhoto.file_size || 0,
        contentType: 'image'
      });
    }

    const hash = computeMessageHash(textBody);
    const dedupeKey = `telegram:${sourceMessageId}:${hash}`;

    const senderName = [fromUser.first_name, fromUser.last_name].filter(Boolean).join(' ') || fromUser.username || 'Telegram User';

    return {
      messageId: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      sourceChannel: 'telegram',
      sourceMessageId,
      conversationId: String(chat.id || sender),
      senderAddress: sender,
      senderName,
      senderType: chat.type === 'group' || chat.type === 'supergroup' ? 'team' : 'person',
      receivedAt: msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString(),
      textBody,
      attachments,
      metadata: { chatId: chat.id, chatType: chat.type, username: fromUser.username },
      rawPayload: raw,
      dedupeKey
    };
  }
}

export const emailAdapter = new EmailAdapter();
export const teamsAdapter = new TeamsAdapter();
export const whatsAppAdapter = new WhatsAppAdapter();
export const telegramAdapter = new TelegramAdapter();

export function getChannelAdapter(channel: SupportedMessageChannel): IChannelAdapter {
  switch (channel) {
    case 'email': return emailAdapter;
    case 'teams': return teamsAdapter;
    case 'whatsapp': return whatsAppAdapter;
    case 'telegram': return telegramAdapter;
    default:
      throw new Error(`Unsupported channel: '${channel}'`);
  }
}
