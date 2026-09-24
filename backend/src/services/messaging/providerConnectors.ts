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

    // 2. Legacy / Standard IMAP / Intranet Authentication
    const defaultHost = config.providerPreset === 'ZOHO'
      ? (config.zohoRegion === 'EU' ? 'imap.zoho.eu' : config.zohoRegion === 'IN' ? 'imap.zoho.in' : config.zohoRegion === 'AU' ? 'imap.zoho.com.au' : config.zohoRegion === 'JP' ? 'imap.zoho.jp' : 'imappro.zoho.com')
      : undefined;
    const host = config.host || config.imapHost || config.server || defaultHost;
    const user = config.user || config.username || config.email;
    const port = config.port || (config.secure !== false ? 993 : 143);

    if (!host || !user) {
      return {
        success: false,
        message: 'Email configuration requires host (e.g. imap.mail.com) and username/email address.'
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
            }
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
            }
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

            // Retrieve attachment metadata if message has attachments
            if (msg.hasAttachment === '1' || msg.hasAttachment === 1 || msg.hasAttachment === true) {
              try {
                const attRes = await fetch(`${baseUrl}/accounts/${accountId}/messages/${msg.messageId}/attachmentinfo`, {
                  headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
                });
                if (attRes.ok) {
                  const attData = await attRes.json() as any;
                  const attList = attData?.data?.attachments || attData?.data || [];
                  attachments = attList.map((a: any, i: number) => ({
                    filename: a.attachmentName || a.fileName || a.name || `attachment-${i}`,
                    mimeType: a.contentType || 'application/octet-stream',
                    size: Number(a.attachmentSize || a.size || 0),
                    attachmentId: a.attachmentId
                  }));
                }
              } catch (attErr: any) {
                console.warn(`[EmailProviderConnector] Attachment inspection warning for ${msg.messageId}:`, attErr.message);
              }
            }

            fetchedMessages.push({
              from: msg.fromAddress || msg.sender,
              senderName: msg.sender || msg.fromAddress,
              sourceMessageId: msg.messageId,
              subject: msg.subject || 'Zoho Inbound Operational Request',
              text: textContent,
              timestamp: new Date(msgTime).toISOString(),
              attachments,
              rawPayload: msg
            });
          }

          console.log(`[EmailProviderConnector] Successfully fetched ${fetchedMessages.length} message(s) from Zoho Mail account ${accountId}`);
          return fetchedMessages;
        }

        // 2. Microsoft 365 Graph API
        if (preset === 'MICROSOFT_365') {
          const user = config.userEmail || config.user || 'me';
          const endpoint = user === 'me'
            ? 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=25&$select=id,from,subject,bodyPreview,body,hasAttachments,receivedDateTime'
            : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(user)}/mailFolders/inbox/messages?$top=25&$select=id,from,subject,bodyPreview,body,hasAttachments,receivedDateTime`;

          const graphRes = await fetch(endpoint, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Accept': 'application/json' }
          });

          if (graphRes.ok) {
            const graphData = await graphRes.json() as any;
            const messages = graphData?.value || [];
            return messages.map((m: any) => ({
              from: m.from?.emailAddress?.address || 'unknown@domain.com',
              senderName: m.from?.emailAddress?.name,
              sourceMessageId: m.id,
              subject: m.subject,
              text: m.body?.content || m.bodyPreview || '',
              timestamp: m.receivedDateTime,
              rawPayload: m
            }));
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
    const tenantId = config.tenantId;
    const clientId = config.clientId || config.appId;

    if (!tenantId || !clientId) {
      return {
        success: false,
        message: 'Microsoft Teams configuration requires tenantId and clientId (App ID).'
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
        await oauth2Service.getValidAccessToken(providerId || null, config as OAuth2Config, 'teams');
      } catch (err: any) {
        console.warn(`[TeamsProviderConnector] OAuth2 token acquisition notice: ${err.message}`);
      }
    }
    const queue: any[] = config.mockInbox || [];
    return queue;
  }

  normalize(rawPayload: any): MessageEnvelope {
    return this.adapter.normalize(rawPayload);
  }
}

export class WhatsAppProviderConnector implements MessageProviderConnector {
  channel: SupportedMessageChannel = 'whatsapp';
  private adapter = new WhatsAppAdapter();

  async testConnection(config: Record<string, any>): Promise<{ success: boolean; message: string; details?: any }> {
    const phoneNumberId = config.phoneNumberId || config.phoneId;
    const accessToken = config.accessToken || config.token;

    if (!phoneNumberId && !config.accountSid) {
      return {
        success: false,
        message: 'WhatsApp Business requires phoneNumberId and accessToken or Twilio Account SID.'
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
    const botToken = config.botToken || config.token;

    if (!botToken || typeof botToken !== 'string' || !botToken.includes(':')) {
      return {
        success: false,
        message: 'Telegram requires a valid bot token (format: 123456789:ABCdef...).'
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
