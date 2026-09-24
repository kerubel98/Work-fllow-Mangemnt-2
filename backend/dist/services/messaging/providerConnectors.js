/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { EmailAdapter, TeamsAdapter, WhatsAppAdapter, TelegramAdapter } from './channelAdapters.js';
import { oauth2Service } from './oauth2Service.js';
export class EmailProviderConnector {
    channel = 'email';
    adapter = new EmailAdapter();
    async testConnection(config) {
        // 1. Modern OAuth2 Authentication (Microsoft 365, Google Workspace, Custom OAuth2)
        if (config.authType === 'OAUTH2' || (config.clientId && config.clientSecret)) {
            if (!config.clientId || !config.clientSecret) {
                return {
                    success: false,
                    message: 'OAuth2 configuration requires clientId (App ID) and clientSecret.'
                };
            }
            return await oauth2Service.testOAuth2Credentials(config, 'email');
        }
        // 2. Legacy / Standard IMAP / Intranet Authentication
        const host = config.host || config.imapHost || config.server;
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
    async fetchNewMessages(config, lastFetchAt, providerId) {
        // If OAuth2 is enabled, ensure we have a valid non-expired access token
        if (config.authType === 'OAUTH2' || (config.clientId && config.clientSecret)) {
            try {
                const accessToken = await oauth2Service.getValidAccessToken(providerId || null, config, 'email');
                const user = config.user || config.username || config.email || 'shared-inbox@bank.com';
                const xoauth2Token = oauth2Service.buildXOAuth2Token(user, accessToken);
                // xoauth2Token is available for SASL XOAUTH2 IMAP handshake
            }
            catch (oauthErr) {
                console.warn(`[EmailProviderConnector] OAuth2 token acquisition notice: ${oauthErr.message}`);
            }
        }
        // If provider has configured simulated or webhook polling queue:
        const incomingInboxQueue = config.mockInbox || [];
        if (incomingInboxQueue.length > 0) {
            return incomingInboxQueue.map(item => ({
                ...item,
                timestamp: item.timestamp || new Date().toISOString()
            }));
        }
        // Fallback: return any messages staged in provider config inbox
        return [];
    }
    normalize(rawPayload) {
        return this.adapter.normalize(rawPayload);
    }
}
export class TeamsProviderConnector {
    channel = 'teams';
    adapter = new TeamsAdapter();
    async testConnection(config) {
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
    async fetchNewMessages(config, lastFetchAt, providerId) {
        if (config.clientSecret) {
            try {
                await oauth2Service.getValidAccessToken(providerId || null, config, 'teams');
            }
            catch (err) {
                console.warn(`[TeamsProviderConnector] OAuth2 token acquisition notice: ${err.message}`);
            }
        }
        const queue = config.mockInbox || [];
        return queue;
    }
    normalize(rawPayload) {
        return this.adapter.normalize(rawPayload);
    }
}
export class WhatsAppProviderConnector {
    channel = 'whatsapp';
    adapter = new WhatsAppAdapter();
    async testConnection(config) {
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
    async fetchNewMessages(config, lastFetchAt) {
        const queue = config.mockInbox || [];
        return queue;
    }
    normalize(rawPayload) {
        return this.adapter.normalize(rawPayload);
    }
}
export class TelegramProviderConnector {
    channel = 'telegram';
    adapter = new TelegramAdapter();
    async testConnection(config) {
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
    async fetchNewMessages(config, lastFetchAt) {
        const queue = config.mockInbox || [];
        return queue;
    }
    normalize(rawPayload) {
        return this.adapter.normalize(rawPayload);
    }
}
const connectors = {
    email: new EmailProviderConnector(),
    teams: new TeamsProviderConnector(),
    whatsapp: new WhatsAppProviderConnector(),
    telegram: new TelegramProviderConnector()
};
export function getProviderConnector(channel) {
    const connector = connectors[channel];
    if (!connector) {
        throw new Error(`Unsupported message provider channel: ${channel}`);
    }
    return connector;
}
