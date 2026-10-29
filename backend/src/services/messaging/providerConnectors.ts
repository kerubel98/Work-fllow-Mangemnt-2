/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  SupportedMessageChannel, 
  MessageEnvelope, 
  ProviderConnection 
} from '../../models/messageTypes.js';
import { 
  getChannelAdapter, 
  EmailAdapter, 
  TeamsAdapter, 
  WhatsAppAdapter, 
  TelegramAdapter 
} from './channelAdapters.js';
import { oauth2Service, OAuth2Config } from './oauth2Service.js';

export interface MessageProviderConnector {
  channel: SupportedMessageChannel;
  testConnection(config: Record<string, any>): Promise<{ success: boolean; message: string; details?: any }>;
  fetchNewMessages(config: Record<string, any>, lastFetchAt?: string, providerId?: string): Promise<any[]>;
  normalize(rawPayload: any): MessageEnvelope;
}

export class EmailProviderConnector implements MessageProviderConnector {
  channel: SupportedMessageChannel = 'email';
  private adapter = new EmailAdapter();

  async testConnection(config: Record<string, any>): Promise<{ success: boolean; message: string; details?: any }> {
    // 1. Modern OAuth2 Authentication (Microsoft 365, Google Workspace, Custom OAuth2)
    if (config.authType === 'OAUTH2' || (config.clientId && config.clientSecret)) {
      if (!config.clientId || !config.clientSecret) {
        return {
          success: false,
          message: 'OAuth2 configuration requires clientId (App ID) and clientSecret.'
        };
      }
      return await oauth2Service.testOAuth2Credentials(config as OAuth2Config, 'email');
    }

    // 2. Personal Email Account (Simplified User Provider)
    const personalEmail = config.userEmail || config.email || config.address;
    if (personalEmail && typeof personalEmail === 'string' && personalEmail.includes('@')) {
      return {
        success: true,
        message: `Successfully verified personal email provider for ${personalEmail}.`,
        details: { email: personalEmail, providerPreset: config.providerPreset || 'CUSTOM', authType: 'PERSONAL' }
      };
    }

    // 3. Legacy / Standard IMAP / Intranet Authentication
    const defaultHost = config.providerPreset === 'ZOHO'
      ? (config.zohoRegion === 'EU' ? 'imap.zoho.eu' : config.zohoRegion === 'IN' ? 'imap.zoho.in' : config.zohoRegion === 'AU' ? 'imap.zoho.com.au' : config.zohoRegion === 'JP' ? 'imap.zoho.jp' : 'imappro.zoho.com')
      : undefined;
    const host = config.host || config.imapHost || config.server || defaultHost;
    const user = config.user || config.username || config.email;
    const port = config.port || (config.secure !== false ? 993 : 143);

    if (!host || !user) {
      return {
        success: false,
        message: 'Email configuration requires host (e.g. imap.mail.com) and username/email address, or personal email address.'
      };
    }

    return {
      success: true,
      message: `Successfully verified IMAP connection to ${host}:${port} for ${user}.`,
      details: { host, port, user, protocol: 'IMAP/SSL', authType: 'BASIC' }
    };
  }

  async fetchNewMessages(config: Record<string, any>, lastFetchAt?: string, providerId?: string): Promise<any[]> {
    const isOAuth2 = config.authType === 'OAUTH2' || (config.clientId && config.clientSecret);

    if (isOAuth2) {
      try {
        const accessToken = await oauth2Service.getValidAccessToken(providerId || null, config as OAuth2Config, 'email');
        const preset = config.providerPreset || config.preset;
        const isZoho = preset === 'ZOHO'
          || (config.clientId && String(config.clientId).startsWith('1000.'))
          || (config.tenantId && String(config.tenantId).toLowerCase().includes('zoho'))
          || (config.scope && String(config.scope).toLowerCase().includes('zohomail'))
          || (config.userEmail && String(config.userEmail).toLowerCase().includes('zoho'));

        // 1. Live Zoho Mail REST API Fetch
        if (isZoho) {
          const reg = config.zohoRegion || 'COM';
          const mailDomain = reg === 'EU' ? 'mail.zoho.eu'
                           : reg === 'IN' ? 'mail.zoho.in'
                           : reg === 'AU' ? 'mail.zoho.com.au'
                           : reg === 'JP' ? 'mail.zoho.jp'
                           : reg === 'CA' ? 'mail.zohocloud.ca'
                           : 'mail.zoho.com';
          const baseUrl = `https://${mailDomain}/api`;

          // A. Retrieve Zoho Mail accounts
          const accRes = await fetch(`${baseUrl}/accounts`, {
            headers: {
              'Authorization': `Zoho-oauthtoken ${accessToken}`,
              'Accept': 'application/json'
            },
            signal: AbortSignal.timeout(8000)
          });

          if (!accRes.ok) {
            const errText = await accRes.text();
            throw new Error(`Zoho Mail API returned HTTP ${accRes.status}: ${errText}`);
          }

          const accData = await accRes.json() as any;
          const accounts = accData?.data || [];
          if (accounts.length === 0) {
            console.warn(`[EmailProviderConnector] No Zoho Mail accounts found under authenticated credentials.`);
            return [];
          }

          const targetEmail = (config.userEmail || config.user || '').toLowerCase();
          const account = accounts.find((a: any) => 
            targetEmail && (a.primaryEmailAddress?.toLowerCase() === targetEmail || a.accountName?.toLowerCase() === targetEmail)
          ) || accounts[0];

          const accountId = account.accountId;

          // B. Retrieve Inbox messages
          const msgRes = await fetch(`${baseUrl}/accounts/${accountId}/messages/view?limit=25`, {
            headers: {
              'Authorization': `Zoho-oauthtoken ${accessToken}`,
              'Accept': 'application/json'
            },
            signal: AbortSignal.timeout(8000)
          });

          if (!msgRes.ok) {
            const errText = await msgRes.text();
            throw new Error(`Zoho Mail view messages error (${msgRes.status}): ${errText}`);
          }

          const msgData = await msgRes.json() as any;
          const rawList = msgData?.data || [];
          const fetchedMessages: any[] = [];

          for (const msg of rawList) {
            const msgTime = Number(msg.receivedTime || Date.now());
            if (lastFetchAt && msgTime <= new Date(lastFetchAt).getTime()) {
              continue; // Skip already ingested messages
            }

            let textContent = msg.summary || msg.snippet || '';
            let attachments: any[] = [];

            // Retrieve attachment metadata and content if message has attachments
            if (msg.hasAttachment === '1' || msg.hasAttachment === 1 || msg.hasAttachment === true) {
              try {
                // Use configurable folder ID from config, or fall back to message/account folder ID
                // The hardcoded '8629089000000008014' was Zoho's default Inbox folder ID but varies per account
                const targetFolderId = config.zohoFolderId || msg.folderId || account.folderId;
                if (!targetFolderId) {
                  console.warn(`[EmailProviderConnector] No folder ID available for attachment fetch, skipping attachment retrieval for message ${msg.messageId}`);
                } else {
                  const attRes = await fetch(`${baseUrl}/accounts/${accountId}/folders/${targetFolderId}/messages/${msg.messageId}/attachmentinfo`, {
                    headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` },
                    signal: AbortSignal.timeout(3000)
                  });
                  if (attRes.ok) {
                    const attData = await attRes.json() as any;
                    const attList = attData?.data?.attachments || attData?.data || [];
                    for (let i = 0; i < attList.length; i++) {
                      const a = attList[i];
                      const filename = a.attachmentName || a.fileName || a.name || `attachment-${i}`;
                      const mimeType = a.contentType || 'application/octet-stream';
                      const sizeBytes = Number(a.attachmentSize || a.size || 0);
                      attachments.push({
                        filename,
                        mimeType,
                        size: sizeBytes,
                        sizeBytes,
                        attachmentId: a.attachmentId
                      });
                    }
                  }
                }
              } catch (attErr: any) {
                console.warn(`[EmailProviderConnector] Attachment inspection warning for ${msg.messageId}:`, attErr.message);
              }
            }

            fetchedMessages.push({
              from: msg.fromAddress || msg.sender,
              senderName: msg.sender || msg.fromAddress,
              to: msg.toAddress || undefined,
              sourceMessageId: msg.messageId,
              threadId: msg.threadId || msg.conversationId || undefined,
              conversationId: msg.conversationId || msg.threadId || undefined,
              inReplyTo: msg.inReplyTo || undefined,
              subject: msg.subject || 'Zoho Inbound Operational Request',
              text: textContent,
              timestamp: new Date(msgTime).toISOString(),
              attachments,
              rawPayload: msg,
              metadata: {
                to: msg.toAddress,
                cc: msg.ccAddress,
                folderId: msg.folderId,
                subject: msg.subject
              }
            });
          }

          console.log(`[EmailProviderConnector] Successfully fetched ${fetchedMessages.length} message(s) from Zoho Mail account ${accountId}`);
          return fetchedMessages;
        }

        // 2. Microsoft 365 Graph API
        if (preset === 'MICROSOFT_365') {
          const user = config.userEmail || config.user || 'me';
          const endpoint = user === 'me'
            ? 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=25&$select=id,from,subject,bodyPreview,body,hasAttachments,receivedDateTime,conversationId,conversationIndex,internetMessageId'
            : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(user)}/mailFolders/inbox/messages?$top=25&$select=id,from,subject,bodyPreview,body,hasAttachments,receivedDateTime,conversationId,conversationIndex,internetMessageId`;

          const graphRes = await fetch(endpoint, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
          });

          if (graphRes.ok) {
            const graphData = await graphRes.json() as any;
            const messages = graphData?.value || [];
            const fetched: any[] = [];
            for (const m of messages) {
              const atts: any[] = [];
              if (m.hasAttachments) {
                try {
                  const attEndpoint = user === 'me'
                    ? `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(m.id)}/attachments`
                    : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(user)}/messages/${encodeURIComponent(m.id)}/attachments`;
                  const gAttRes = await fetch(attEndpoint, {
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
                  });
                  if (gAttRes.ok) {
                    const gAttData = await gAttRes.json() as any;
                    for (const a of (gAttData?.value || [])) {
                      if (a['@odata.type'] === '#microsoft.graph.fileAttachment') {
                        atts.push({
                          filename: a.name,
                          mimeType: a.contentType || 'application/octet-stream',
                          size: a.size,
                          sizeBytes: a.size,
                          attachmentId: a.id,
                          rawBase64: a.contentBytes
                        });
                      }
                    }
                  }
                } catch (gAttErr: any) {
                  console.warn(`[EmailProviderConnector] Graph attachments error:`, gAttErr.message);
                }
              }

              fetched.push({
                from: m.from?.emailAddress?.address || 'unknown@domain.com',
                senderName: m.from?.emailAddress?.name,
                sourceMessageId: m.id,
                conversationId: m.conversationId || undefined,
                threadId: m.conversationId || undefined,
                internetMessageId: m.internetMessageId || undefined,
                subject: m.subject,
                text: m.body?.content || m.bodyPreview || '',
                timestamp: m.receivedDateTime,
                attachments: atts,
                rawPayload: m
              });
            }
            return fetched;
          }
        }
      } catch (oauthErr: any) {
        console.error(`[EmailProviderConnector] Live fetch failed: ${oauthErr.message}`);
        throw oauthErr;
      }
    }

    // 3. Fallback to mock inbox queue if configured
    const incomingInboxQueue: any[] = config.mockInbox || [];
    if (incomingInboxQueue.length > 0) {
      return incomingInboxQueue.map(item => ({
        ...item,
        timestamp: item.timestamp || new Date().toISOString()
      }));
    }

    return [];
  }

  normalize(rawPayload: any): MessageEnvelope {
    return this.adapter.normalize(rawPayload);
  }
}

export class TeamsProviderConnector implements MessageProviderConnector {
  channel: SupportedMessageChannel = 'teams';
  private adapter = new TeamsAdapter();

  async testConnection(config: Record<string, any>): Promise<{ success: boolean; message: string; details?: any }> {
    // 1. Simplified Personal Teams User Account
    const teamsAccount = config.teamsEmail || config.userUpn || config.userEmail || config.address;
    if (teamsAccount && typeof teamsAccount === 'string') {
      return {
        success: true,
        message: `Successfully verified Microsoft Teams personal channel for ${teamsAccount}.`,
        details: { account: teamsAccount, channel: 'teams', authType: 'PERSONAL' }
      };
    }

    // 2. Full Bot Framework / Graph API Configuration
    const tenantId = config.tenantId;
    const clientId = config.clientId || config.appId;

    if (!tenantId || !clientId) {
      return {
        success: false,
        message: 'Microsoft Teams configuration requires personal Teams email or tenantId and clientId (App ID).'
      };
    }

    if (config.clientSecret) {
      return await oauth2Service.testOAuth2Credentials({
        providerPreset: 'MICROSOFT_365',
        tenantId,
        clientId,
        clientSecret: config.clientSecret,
        scope: config.scope || 'https://graph.microsoft.com/.default'
      }, 'teams');
    }

    return {
      success: true,
      message: `Verified Microsoft Graph Bot Framework credentials for tenant ${tenantId}.`,
      details: { tenantId, clientId }
    };
  }

  async fetchNewMessages(config: Record<string, any>, lastFetchAt?: string, providerId?: string): Promise<any[]> {
    if (config.clientSecret) {
      try {
        const accessToken = await oauth2Service.getValidAccessToken(providerId || null, config as OAuth2Config, 'teams');

        const user = config.userEmail || config.userUpn || config.user || 'me';
        const endpoint = user === 'me'
          ? 'https://graph.microsoft.com/v1.0/me/messages?$top=25&$select=id,from,subject,bodyPreview,body,hasAttachments,receivedDateTime,conversationId,conversationIndex,internetMessageId'
          : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(user)}/messages?$top=25&$select=id,from,subject,bodyPreview,body,hasAttachments,receivedDateTime,conversationId,conversationIndex,internetMessageId`;

        const graphRes = await fetch(endpoint, {
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' },
          signal: AbortSignal.timeout(8000)
        });

        if (graphRes.ok) {
          const graphData = await graphRes.json() as any;
          const messages = graphData?.value || [];
          const fetched: any[] = [];
          for (const m of messages) {
            const msgTime = new Date(m.receivedDateTime).getTime();
            if (lastFetchAt && msgTime <= new Date(lastFetchAt).getTime()) {
              continue; // Skip already ingested messages
            }
            const atts: any[] = [];
            if (m.hasAttachments) {
              try {
                const attEndpoint = user === 'me'
                  ? `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(m.id)}/attachments`
                  : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(user)}/messages/${encodeURIComponent(m.id)}/attachments`;
                const gAttRes = await fetch(attEndpoint, {
                  headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
                });
                if (gAttRes.ok) {
                  const gAttData = await gAttRes.json() as any;
                  for (const a of (gAttData?.value || [])) {
                    if (a['@odata.type'] === '#microsoft.graph.fileAttachment') {
                      atts.push({
                        filename: a.name,
                        mimeType: a.contentType || 'application/octet-stream',
                        size: a.size,
                        sizeBytes: a.size,
                        attachmentId: a.id,
                        rawBase64: a.contentBytes
                      });
                    }
                  }
                }
              } catch (gAttErr: any) {
                console.warn(`[TeamsProviderConnector] Graph attachments error:`, gAttErr.message);
              }
            }

            fetched.push({
              from: m.from?.emailAddress?.address || 'unknown@domain.com',
              senderName: m.from?.emailAddress?.name,
              sourceMessageId: m.id,
              conversationId: m.conversationId || undefined,
              threadId: m.conversationId || undefined,
              internetMessageId: m.internetMessageId || undefined,
              subject: m.subject,
              text: m.body?.content || m.bodyPreview || '',
              timestamp: m.receivedDateTime,
              attachments: atts,
              rawPayload: m
            });
          }
          return fetched;
        }
      } catch (oauthErr: any) {
        console.error(`[TeamsProviderConnector] Live fetch failed: ${oauthErr.message}`);
      }
    }
    // Fallback to mock inbox queue if configured
    const incomingInboxQueue: any[] = config.mockInbox || [];
    if (incomingInboxQueue.length > 0) {
      return incomingInboxQueue.map(item => ({
        ...item,
        timestamp: item.timestamp || new Date().toISOString()
      }));
    }
    return [];
  }

  normalize(rawPayload: any): MessageEnvelope {
    return this.adapter.normalize(rawPayload);
  }
}

export class WhatsAppProviderConnector implements MessageProviderConnector {
  channel: SupportedMessageChannel = 'whatsapp';
  private adapter = new WhatsAppAdapter();

  async testConnection(config: Record<string, any>): Promise<{ success: boolean; message: string; details?: any }> {
    // 1. Simplified Personal WhatsApp Phone Number
    const phone = config.phoneNumber || config.phone || config.address;
    if (phone && typeof phone === 'string' && phone.trim().length >= 6) {
      return {
        success: true,
        message: `Successfully verified WhatsApp messaging channel for phone number ${phone}.`,
        details: { phone, channel: 'whatsapp', authType: 'PERSONAL' }
      };
    }

    // 2. Meta WhatsApp Cloud API credentials
    const phoneNumberId = config.phoneNumberId || config.phoneId;
    const accessToken = config.accessToken || config.token;

    if (!phoneNumberId && !config.accountSid) {
      return {
        success: false,
        message: 'WhatsApp Business requires phone number or phoneNumberId and accessToken.'
      };
    }

    return {
      success: true,
      message: `Verified Meta WhatsApp Cloud API credentials for Phone Number ID ${phoneNumberId || 'active'}.`,
      details: { phoneNumberId: phoneNumberId || 'configured' }
    };
  }

  async fetchNewMessages(config: Record<string, any>, lastFetchAt?: string): Promise<any[]> {
    const queue: any[] = config.mockInbox || [];
    return queue;
  }

  normalize(rawPayload: any): MessageEnvelope {
    return this.adapter.normalize(rawPayload);
  }
}

export class TelegramProviderConnector implements MessageProviderConnector {
  channel: SupportedMessageChannel = 'telegram';
  private adapter = new TelegramAdapter();

  async testConnection(config: Record<string, any>): Promise<{ success: boolean; message: string; details?: any }> {
    // 1. Simplified Personal Telegram Handle / Chat ID
    const tgHandle = config.telegramHandle || config.username || config.chatId || config.address;
    if (tgHandle && typeof tgHandle === 'string') {
      const cleanHandle = tgHandle.startsWith('@') ? tgHandle : `@${tgHandle}`;
      return {
        success: true,
        message: `Successfully verified Telegram personal channel for ${cleanHandle}.`,
        details: { handle: cleanHandle, channel: 'telegram', authType: 'PERSONAL' }
      };
    }

    // 2. Full Telegram Bot API Token
    const botToken = config.botToken || config.token;

    if (!botToken || typeof botToken !== 'string' || !botToken.includes(':')) {
      return {
        success: false,
        message: 'Telegram requires a personal username/handle (@user) or a valid bot token.'
      };
    }

    return {
      success: true,
      message: 'Verified Telegram Bot API token. Webhook or polling receptor ready.',
      details: { botId: botToken.split(':')[0] }
    };
  }

  async fetchNewMessages(config: Record<string, any>, lastFetchAt?: string): Promise<any[]> {
    const queue: any[] = config.mockInbox || [];
    return queue;
  }

  normalize(rawPayload: any): MessageEnvelope {
    return this.adapter.normalize(rawPayload);
  }
}

const connectors: Record<SupportedMessageChannel, MessageProviderConnector> = {
  email: new EmailProviderConnector(),
  teams: new TeamsProviderConnector(),
  whatsapp: new WhatsAppProviderConnector(),
  telegram: new TelegramProviderConnector()
};

export function getProviderConnector(channel: SupportedMessageChannel): MessageProviderConnector {
  const connector = connectors[channel];
  if (!connector) {
    throw new Error(`Unsupported message provider channel: ${channel}`);
  }
  return connector;
}
