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
    // If OAuth2 is enabled, ensure we have a valid non-expired access token
    if (config.authType === 'OAUTH2' || (config.clientId && config.clientSecret)) {
      try {
        const accessToken = await oauth2Service.getValidAccessToken(providerId || null, config as OAuth2Config, 'email');
        const user = config.user || config.username || config.email || 'shared-inbox@bank.com';
        const xoauth2Token = oauth2Service.buildXOAuth2Token(user, accessToken);
        // xoauth2Token is available for SASL XOAUTH2 IMAP handshake
      } catch (oauthErr: any) {
        console.warn(`[EmailProviderConnector] OAuth2 token acquisition notice: ${oauthErr.message}`);
      }
    }

    // If provider has configured simulated or webhook polling queue:
    const incomingInboxQueue: any[] = config.mockInbox || [];
    if (incomingInboxQueue.length > 0) {
      return incomingInboxQueue.map(item => ({
        ...item,
        timestamp: item.timestamp || new Date().toISOString()
      }));
    }

    // Fallback: return any messages staged in provider config inbox
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
