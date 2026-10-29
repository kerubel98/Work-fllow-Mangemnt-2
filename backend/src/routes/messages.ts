/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router, Request, Response } from 'express';
import { getChannelAdapter } from '../services/messaging/channelAdapters.js';
import { messageIntakeService } from '../services/messaging/messageIntakeService.js';
import { outboundDispatchService } from '../services/messaging/outboundDispatchService.js';
import { SupportedMessageChannel } from '../models/messageTypes.js';
import { getPostgresPool } from '../config/postgres.js';

export const messagesRouter = Router();

/**
 * Inbound webhook for external channel events (Email, Teams, WhatsApp, Telegram).
 */
messagesRouter.post('/webhook/:channel', async (req: Request, res: Response) => {
  try {
    const channel = req.params.channel as SupportedMessageChannel;
    const adapter = getChannelAdapter(channel);

    const signature = (req.headers['x-hub-signature-256'] || req.headers['authorization'] || req.headers['x-telegram-bot-api-secret-token']) as string | undefined;

    if (!adapter.verifySignature(req.body, signature)) {
      return res.status(401).json({ error: 'Invalid webhook signature.' });
    }

    const envelope = adapter.normalize(req.body);
    const result = await messageIntakeService.processEnvelope(envelope);

    return res.status(200).json({
      success: true,
      messageId: result.messageId,
      status: result.status,
      intent: result.intent,
      linkedIssueId: result.linkedIssueId,
      createdIssueId: result.createdIssueId,
      replyMessageId: result.replyMessageId
    });
  } catch (err: any) {
    console.error('[messagesRouter] Webhook intake failure:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Simulator endpoint for local testing of external channel interactions.
 */
messagesRouter.post('/simulator/send', async (req: Request, res: Response) => {
  try {
    const { channel, senderAddress, senderName, text, linkedIssueId, attachments } = req.body;

    if (!channel || !senderAddress || !text) {
      return res.status(400).json({ error: 'channel, senderAddress, and text are required.' });
    }

    const adapter = getChannelAdapter(channel as SupportedMessageChannel);
    const mockPayload: any = {
      from: senderAddress,
      fromName: senderName || 'Simulator User',
      sender: senderAddress,
      text,
      body: text,
      content: text,
      timestamp: new Date().toISOString(),
      metadata: { linkedIssueId }
    };

    if (attachments && Array.isArray(attachments)) {
      mockPayload.attachments = attachments;
    }

    const envelope = adapter.normalize(mockPayload);
    if (linkedIssueId) {
      envelope.metadata = { ...envelope.metadata, linkedIssueId };
    }

    const result = await messageIntakeService.processEnvelope(envelope);
    return res.status(200).json({ success: true, result });
  } catch (err: any) {
    console.error('[messagesRouter] Simulator failure:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Inbox message log.
 */
messagesRouter.get('/inbox', async (req: Request, res: Response) => {
  try {
    const teamId = req.query.teamId as string | undefined;
    const issueId = req.query.issueId as string | undefined;
    const limit = parseInt(req.query.limit as string || '50', 10);

    const messages = await messageIntakeService.getRecentIncomingMessages(limit, teamId, issueId);
    return res.json(messages);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Outbox delivery log.
 */
messagesRouter.get('/outbox', async (req: Request, res: Response) => {
  try {
    const issueId = req.query.issueId as string | undefined;
    const limit = parseInt(req.query.limit as string || '50', 10);

    const messages = await outboundDispatchService.getOutboxMessages(limit, issueId);
    return res.json(messages);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Team Channel Configurations.
 */
messagesRouter.get('/configs/team/:teamId', async (req: Request, res: Response) => {
  try {
    const configs = await messageIntakeService.getTeamConfigurations(req.params.teamId);
    return res.json(configs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

messagesRouter.post('/configs/team', async (req: Request, res: Response) => {
  try {
    const { teamId, channel, displayName, address, isPrimary, isActive, webhookSecret, permissions, createdBy } = req.body;
    if (!teamId || !channel || !address) {
      return res.status(400).json({ error: 'teamId, channel, and address are required.' });
    }

    const saved = await messageIntakeService.saveTeamConfiguration({
      teamId,
      channel,
      displayName: displayName || `${channel} Channel`,
      address,
      isPrimary: isPrimary || false,
      isActive: isActive !== false,
      webhookSecret,
      permissions: permissions || ['read', 'reply', 'create_task', 'escalate'],
      createdBy
    });

    return res.status(201).json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Personal Channel Configurations.
 */
messagesRouter.get('/configs/personal/:userId', async (req: Request, res: Response) => {
  try {
    const configs = await messageIntakeService.getPersonalConfigurations(req.params.userId);
    return res.json(configs);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

messagesRouter.post('/configs/personal', async (req: Request, res: Response) => {
  try {
    const { userId, channel, displayName, address, isDefault, isActive, notificationMode } = req.body;
    if (!userId || !channel || !address) {
      return res.status(400).json({ error: 'userId, channel, and address are required.' });
    }

    const saved = await messageIntakeService.savePersonalConfiguration({
      userId,
      channel,
      displayName: displayName || `${channel} Account`,
      address,
      isDefault: isDefault || false,
      isActive: isActive !== false,
      notificationMode: notificationMode || 'all'
    });

    return res.status(201).json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * ========================================================
 * Provider Connection & Active Fetch Management Endpoints
 * ========================================================
 */

// GET /api/messages/providers - List configured providers
messagesRouter.get('/providers', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const teamId = req.query.teamId as string | undefined;
    const userId = req.query.userId as string | undefined;
    const providers = await stagingService.getProviderConnections(teamId, userId);
    return res.json(providers);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/providers - Create or update provider connection
messagesRouter.post('/providers', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const { channel, displayName, teamId, userId, config, status, createdBy } = req.body;
    if (!channel) {
      return res.status(400).json({ error: 'channel is required.' });
    }

    const saved = await stagingService.saveProviderConnection({
      channel,
      displayName,
      teamId,
      userId,
      config,
      status,
      createdBy
    });

    // Synchronize to personal_channel_configurations and personal mailbox if userId is specified
    if (userId) {
      try {
        const address = config?.userEmail || config?.email || config?.teamsEmail || config?.userUpn || config?.phoneNumber || config?.phone || config?.telegramHandle || config?.username || config?.chatId || config?.address;
        if (address) {
          const { messageIntakeService } = await import('../services/messaging/messageIntakeService.js');
          await messageIntakeService.savePersonalConfiguration({
            userId,
            channel,
            displayName: displayName || `${channel.toUpperCase()} Provider`,
            address,
            isActive: status !== 'INACTIVE',
            isDefault: true
          });

          const { getPostgresPool } = await import('../config/postgres.js');
          const pool = getPostgresPool();

          // If email, update user's primary message_provider_settings
          if (channel === 'email') {
            await pool.query(
              `UPDATE users SET message_provider_settings = jsonb_set(COALESCE(message_provider_settings, '{}'::jsonb), '{userEmail}', to_jsonb($1::text)) WHERE id = $2;`,
              [address, userId]
            );
          }
        }
      } catch (syncErr: any) {
        console.warn('[messagesRouter] Could not sync personal channel configurations:', syncErr.message);
      }
    }

    return res.status(201).json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/messages/providers/:id - Delete provider connection
messagesRouter.delete('/providers/:id', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const deleted = await stagingService.deleteProviderConnection(req.params.id);
    return res.json({ success: deleted });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/providers/:id/test - Test provider connection credentials
messagesRouter.post('/providers/:id/test', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const result = await stagingService.testProviderConnection(req.params.id);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/providers/:id/fetch - Trigger on-demand message fetch
messagesRouter.post('/providers/:id/fetch', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const result = await stagingService.fetchProviderMessages(req.params.id);
    return res.json({ success: true, ...result });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/teams/:teamId/fetch - Trigger on-demand message fetch across all active providers for a team
messagesRouter.post('/teams/:teamId/fetch', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const { teamId } = req.params;
    const providers = await stagingService.getProviderConnections(teamId);
    const active = providers.filter(p => p.status === 'ACTIVE');
    const results = [];
    let totalStaged = 0;

    for (const p of active) {
      try {
        const fetchRes = await stagingService.fetchProviderMessages(p.id);
        totalStaged += fetchRes.stagedCount || 0;
        results.push({ providerId: p.id, displayName: p.displayName, ...fetchRes });
      } catch (err: any) {
        results.push({ providerId: p.id, displayName: p.displayName, error: err.message });
      }
    }
    return res.json({ success: true, totalStaged, results });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/users/:userId/fetch - Trigger on-demand message fetch across all active providers for a user
messagesRouter.post('/users/:userId/fetch', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const { getPostgresPool } = await import('../config/postgres.js');
    const { userId } = req.params;
    const pool = getPostgresPool();

    const provRes = await pool.query(
      `SELECT * FROM provider_connections WHERE user_id = $1 AND status = 'ACTIVE';`,
      [userId]
    );
    const results = [];
    let totalStaged = 0;

    for (const p of provRes.rows) {
      try {
        const fetchRes = await stagingService.fetchProviderMessages(p.id);
        totalStaged += fetchRes.stagedCount || 0;
        results.push({ providerId: p.id, displayName: p.display_name, ...fetchRes });
      } catch (err: any) {
        console.warn(`[messagesRouter] User fetch error for provider ${p.id}:`, err.message);
        results.push({ providerId: p.id, displayName: p.display_name, error: err.message });
      }
    }
    return res.json({ success: true, totalStaged, results });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/messages/oauth2/authorize - Generates official provider OAuth 2.0 authorization URL and routes user
messagesRouter.get('/oauth2/authorize', async (req: Request, res: Response) => {
  try {
    const { getPostgresPool } = await import('../config/postgres.js');
    const pool = getPostgresPool();
    const providerId = (req.query.providerId as string) || '';
    const userId = (req.query.userId as string) || '';
    const userEmail = (req.query.userEmail as string) || '';
    const returnUrl = (req.query.returnUrl as string) || 'http://localhost:3001/?activeNav=messages';
    const format = req.query.format as string | undefined;

    if (!providerId || !userId) {
      return res.status(400).json({ error: 'providerId and userId are required to initiate authorization.' });
    }

    const provRes = await pool.query(
      `SELECT * FROM provider_connections WHERE id = $1 AND team_id IS NULL;`,
      [providerId]
    );
    if (provRes.rows.length === 0) {
      return res.status(404).json({ error: 'Admin-configured provider not found.' });
    }

    const provider = provRes.rows[0];
    const config = provider.config || {};
    const preset = (config.providerPreset || config.preset || 'ZOHO').toUpperCase();
    const clientId = config.clientId?.trim();

    if (!clientId) {
      return res.status(400).json({ error: 'Provider is missing clientId in configuration.' });
    }

    const redirectUri = config.redirectUri?.trim() ||
                        config.redirect_uri?.trim() ||
                        (req.query.redirectUri as string)?.trim() ||
                        `${req.protocol}://${req.get('host')}/api/messages/oauth2/callback`;
    const stateObj = { providerId, userId, userEmail, returnUrl, redirectUri };
    const state = Buffer.from(JSON.stringify(stateObj)).toString('base64url');

    let authUrl = '';
    if (preset === 'ZOHO' || clientId.startsWith('1000.')) {
      const reg = config.zohoRegion || 'COM';
      const domain = reg === 'EU' ? 'accounts.zoho.eu'
                   : reg === 'IN' ? 'accounts.zoho.in'
                   : reg === 'AU' ? 'accounts.zoho.com.au'
                   : reg === 'JP' ? 'accounts.zoho.jp'
                   : reg === 'CA' ? 'accounts.zohocloud.ca'
                   : 'accounts.zoho.com';
      const scope = config.scope || 'ZohoMail.messages.ALL,ZohoMail.accounts.ALL';
      authUrl = `https://${domain}/oauth/v2/auth?response_type=code&client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&access_type=offline&prompt=consent&state=${state}`;
    } else if (preset === 'GOOGLE_WORKSPACE' || preset === 'GMAIL') {
      const scope = config.scope || 'https://mail.google.com/';
      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&access_type=offline&prompt=consent&state=${state}`;
    } else if (preset === 'MICROSOFT_365' || preset === 'TEAMS') {
      const tenant = config.tenantId || 'common';
      const scope = config.scope || 'https://graph.microsoft.com/.default offline_access';
      authUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&prompt=consent&state=${state}`;
    } else {
      return res.status(400).json({ error: `Provider preset ${preset} does not support interactive OAuth2 redirect authorization.` });
    }

    if (format === 'json' || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, authorizationUrl: authUrl, redirectUri });
    }

    return res.redirect(authUrl);
  } catch (err: any) {
    console.error('[messagesRouter] Error generating authorization URL:', err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/messages/oauth2/callback - Handles provider redirect callback with authorization code
messagesRouter.get('/oauth2/callback', async (req: Request, res: Response) => {
  try {
    const { code, state, error, error_description } = req.query as {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    };

    let stateObj: { providerId?: string; userId?: string; userEmail?: string; returnUrl?: string } = {};
    if (state) {
      try {
        stateObj = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'));
      } catch {
        stateObj = {};
      }
    }

    const returnUrl = stateObj.returnUrl || 'http://localhost:3001/?activeNav=messages';
    const redirectTarget = new URL(returnUrl, 'http://localhost:3001');

    if (error) {
      console.warn('[messagesRouter] OAuth2 callback error:', error, error_description);
      redirectTarget.searchParams.set('oauth_error', error_description || error);
      return res.redirect(redirectTarget.toString());
    }

    if (!code) {
      redirectTarget.searchParams.set('oauth_error', 'Missing authorization code from provider.');
      return res.redirect(redirectTarget.toString());
    }

    const { getPostgresPool } = await import('../config/postgres.js');
    const { oauth2Service } = await import('../services/messaging/oauth2Service.js');
    const pool = getPostgresPool();

    const providerId = stateObj.providerId;
    const userId = stateObj.userId;
    if (!providerId || !userId) {
      redirectTarget.searchParams.set('oauth_error', 'Missing state providerId or userId in callback.');
      return res.redirect(redirectTarget.toString());
    }

    const provRes = await pool.query(
      `SELECT * FROM provider_connections WHERE id = $1;`,
      [providerId]
    );
    if (provRes.rows.length === 0) {
      redirectTarget.searchParams.set('oauth_error', 'Enterprise connection definition not found.');
      return res.redirect(redirectTarget.toString());
    }

    const adminConn = provRes.rows[0];
    const adminConfig = adminConn.config || {};
    const redirectUri = adminConfig.redirectUri?.trim() ||
                        adminConfig.redirect_uri?.trim() ||
                        ((stateObj as any).redirectUri as string)?.trim() ||
                        `${req.protocol}://${req.get('host')}/api/messages/oauth2/callback`;

    // Exchange authorization code for tokens
    const tokenResult = await oauth2Service.acquireTokenAuthorizationCode({
      ...adminConfig,
      code,
      redirectUri
    });

    let userEmail = stateObj.userEmail || adminConfig.userEmail || 'user@operations.et';
    try {
      const acctRes = await fetch('https://mail.zoho.com/api/accounts', {
        headers: {
          'Authorization': `Zoho-oauthtoken ${tokenResult.accessToken}`,
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(5000)
      });
      if (acctRes.ok) {
        const acctData: any = await acctRes.json();
        const primary = acctData?.data?.[0]?.primaryEmailAddress || acctData?.data?.[0]?.mailboxAddress;
        if (primary) {
          userEmail = primary;
        }
      }
    } catch (e: any) {
      console.warn('[messagesRouter] Could not query authenticated Zoho account profile:', e.message);
    }

    // Upsert user provider connection
    const existing = await pool.query(
      `SELECT id FROM provider_connections WHERE user_id = $1 AND (config->>'adminOAuth2ConnectionId' = $2 OR channel = $3) LIMIT 1;`,
      [userId, providerId, adminConn.channel]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE provider_connections SET
          status = 'ACTIVE',
          display_name = $1,
          config = jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(COALESCE(config, '{}'::jsonb), '{accessToken}', to_jsonb($2::text)),
                '{refreshToken}', to_jsonb($3::text)
              ),
              '{tokenExpiry}', to_jsonb($4::bigint)
            ),
            '{userEmail}', to_jsonb($5::text)
          ),
          updated_at = NOW()
        WHERE id = $6;`,
        [
          `Zoho Mail (${userEmail})`,
          tokenResult.accessToken,
          tokenResult.refreshToken || '',
          tokenResult.tokenExpiry,
          userEmail,
          existing.rows[0].id
        ]
      );
    } else {
      const newId = `prov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      await pool.query(
        `INSERT INTO provider_connections (id, channel, display_name, user_id, status, created_by, config, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, NOW(), NOW());`,
        [
          newId,
          adminConn.channel,
          `Zoho Mail (${userEmail})`,
          userId,
          userId,
          JSON.stringify({
            adminOAuth2ConnectionId: providerId,
            providerPreset: adminConfig.providerPreset || 'ZOHO',
            userEmail,
            accessToken: tokenResult.accessToken,
            refreshToken: tokenResult.refreshToken || '',
            tokenExpiry: tokenResult.tokenExpiry,
            scope: tokenResult.scope || adminConfig.scope
          })
        ]
      );
    }

    // Synchronize user message_provider_settings
    await pool.query(
      `UPDATE users SET message_provider_settings = jsonb_set(
        jsonb_set(COALESCE(message_provider_settings, '{}'::jsonb), '{status}', '"ACTIVE"'),
        '{userEmail}', to_jsonb($1::text)
      ) WHERE id = $2;`,
      [userEmail, userId]
    );

    redirectTarget.searchParams.set('oauth_success', 'zoho');
    return res.redirect(redirectTarget.toString());
  } catch (err: any) {
    console.error('[messagesRouter] Error in OAuth2 callback exchange:', err);
    const returnUrl = 'http://localhost:3001/?activeNav=messages';
    const redirectTarget = new URL(returnUrl);
    redirectTarget.searchParams.set('oauth_error', err.message);
    return res.redirect(redirectTarget.toString());
  }
});

// POST /api/messages/oauth2/manual-grant - Direct exchange of Zoho Self-Client grant token/code or enterprise credentials
messagesRouter.post('/oauth2/manual-grant', async (req: Request, res: Response) => {
  try {
    const { providerId, userId, userEmail } = req.body;
    const code = (req.body.code || req.body.grantToken || '')?.trim();
    if (!providerId || !userId) {
      return res.status(400).json({ error: 'providerId and userId are required.' });
    }

    const { getPostgresPool } = await import('../config/postgres.js');
    const { oauth2Service } = await import('../services/messaging/oauth2Service.js');
    const pool = getPostgresPool();

    const provRes = await pool.query(
      `SELECT * FROM provider_connections WHERE id = $1;`,
      [providerId]
    );
    if (provRes.rows.length === 0) {
      return res.status(404).json({ error: 'Enterprise connection not found.' });
    }

    const adminConn = provRes.rows[0];
    const adminConfig = adminConn.config || {};

    let tokenResult;
    if (code) {
      tokenResult = await oauth2Service.acquireTokenAuthorizationCode({
        ...adminConfig,
        code: code.trim()
      });
    } else {
      if (adminConn.channel === 'email') {
        return res.status(400).json({
          error: 'Personal email accounts cannot be linked using organization client credentials without user consent. Please use Consent Redirection or provide a personal Self-Client grant code.'
        });
      }
      tokenResult = await oauth2Service.acquireTokenClientCredentials(adminConfig);
    }

    const email = userEmail || adminConfig.userEmail || 'admin@paymentops.com';

    // Upsert user provider connection
    const existing = await pool.query(
      `SELECT id FROM provider_connections WHERE user_id = $1 AND (config->>'adminOAuth2ConnectionId' = $2 OR channel = $3) LIMIT 1;`,
      [userId, providerId, adminConn.channel]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE provider_connections SET
          status = 'ACTIVE',
          display_name = $1,
          config = jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(COALESCE(config, '{}'::jsonb), '{accessToken}', to_jsonb($2::text)),
                '{refreshToken}', to_jsonb($3::text)
              ),
              '{tokenExpiry}', to_jsonb($4::bigint)
            ),
            '{userEmail}', to_jsonb($5::text)
          ),
          updated_at = NOW()
        WHERE id = $6;`,
        [
          `Zoho Mail (${email})`,
          tokenResult.accessToken,
          (tokenResult as any).refreshToken || '',
          tokenResult.tokenExpiry,
          email,
          existing.rows[0].id
        ]
      );
    } else {
      const newId = `prov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      await pool.query(
        `INSERT INTO provider_connections (id, channel, display_name, user_id, status, created_by, config, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, NOW(), NOW());`,
        [
          newId,
          adminConn.channel,
          `Zoho Mail (${email})`,
          userId,
          userId,
          JSON.stringify({
            adminOAuth2ConnectionId: providerId,
            providerPreset: adminConfig.providerPreset || 'ZOHO',
            userEmail: email,
            accessToken: tokenResult.accessToken,
            refreshToken: (tokenResult as any).refreshToken || '',
            tokenExpiry: tokenResult.tokenExpiry,
            scope: tokenResult.scope || adminConfig.scope
          })
        ]
      );
    }

    // Update users message_provider_settings
    await pool.query(
      `UPDATE users SET message_provider_settings = jsonb_set(
        jsonb_set(COALESCE(message_provider_settings, '{}'::jsonb), '{status}', '"ACTIVE"'),
        '{userEmail}', to_jsonb($1::text)
      ) WHERE id = $2;`,
      [email, userId]
    );

    return res.json({
      success: true,
      message: 'Zoho Mail account successfully authenticated and linked!',
      tokenExpiry: tokenResult.tokenExpiry
    });
  } catch (err: any) {
    console.error('[messagesRouter] Error in manual grant exchange:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/oauth2/test - Direct test of OAuth2 credentials & token acquisition
messagesRouter.post('/oauth2/test', async (req: Request, res: Response) => {
  try {
    const { oauth2Service } = await import('../services/messaging/oauth2Service.js');
    const { config, channel } = req.body;
    const effectiveConfig = config || (req.body.adminOAuth2ConnectionId || req.body.clientId || req.body.authType ? req.body : null);
    if (!effectiveConfig) {
      return res.status(400).json({ error: 'config is required.' });
    }
    const result = await oauth2Service.testOAuth2Credentials(effectiveConfig, channel || effectiveConfig.channel || 'email');
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * ========================================================
 * Admin Global OAuth 2.0 Connection Management Endpoints
 * ========================================================
 */

// GET /api/messages/admin/oauth2 - List Admin-configured OAuth2 Connections
messagesRouter.get('/admin/oauth2', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const connections = await stagingService.getAdminOAuth2Connections();
    const masked = connections.map(conn => ({
      ...conn,
      config: {
        ...conn.config,
        clientSecret: conn.config?.clientSecret ? '••••••••' : '',
        hasSecret: !!conn.config?.clientSecret
      }
    }));
    return res.json(masked);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/messages/admin/oauth2/available - Public catalog for teams and users to pick from
messagesRouter.get('/admin/oauth2/available', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const connections = await stagingService.getAdminOAuth2Connections();
    const available = connections
      .filter(c => c.status === 'ACTIVE')
      .map(c => ({
        id: c.id,
        displayName: c.displayName,
        channel: c.channel,
        providerPreset: c.config?.providerPreset || c.config?.preset || 'CUSTOM',
        logoUrl: c.config?.logoUrl || '',
        tenantId: c.config?.tenantId || '',
        scope: c.config?.scope || '',
        grantType: c.config?.grantType || 'client_credentials',
        userEmail: c.config?.userEmail || ''
      }));
    return res.json(available);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/admin/oauth2 - Create or update Admin OAuth2 Connection
messagesRouter.post('/admin/oauth2', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const { id, displayName, channel, config, status, createdBy } = req.body;
    if (!displayName) {
      return res.status(400).json({ error: 'displayName is required for Admin OAuth2 connection.' });
    }

    let mergedConfig = { ...(config || {}) };
    mergedConfig.authType = mergedConfig.authType || 'OAUTH2';
    mergedConfig.isGlobal = true;

    // If editing existing connection and clientSecret is masked, preserve existing secret
    if (id && (!mergedConfig.clientSecret || mergedConfig.clientSecret === '••••••••')) {
      const existing = await stagingService.getProviderConnectionById(id);
      if (existing?.config?.clientSecret) {
        mergedConfig.clientSecret = existing.config.clientSecret;
      }
    }

    // Determine effective channel and preset
    const effectivePreset = (mergedConfig.providerPreset || mergedConfig.preset || '').toUpperCase();
    const effectiveChannel = channel || (
      effectivePreset === 'TEAMS' ? 'teams' :
      effectivePreset === 'WHATSAPP' ? 'whatsapp' :
      effectivePreset === 'TELEGRAM' ? 'telegram' : 'email'
    );

    // Validate credentials based on channel
    if (effectiveChannel === 'telegram') {
      if (!mergedConfig.botToken && !mergedConfig.clientId && !mergedConfig.clientSecret) {
        return res.status(400).json({ error: 'Bot Token is required for Telegram enterprise bot.' });
      }
    } else if (effectiveChannel === 'whatsapp') {
      if (!mergedConfig.accessToken && !mergedConfig.clientSecret) {
        return res.status(400).json({ error: 'System User Access Token is required for WhatsApp Cloud API.' });
      }
    } else {
      if (!mergedConfig.clientId) {
        return res.status(400).json({ error: 'Client ID (App ID) is required.' });
      }
      if (!mergedConfig.clientSecret) {
        return res.status(400).json({ error: 'Client Secret is required.' });
      }
    }

    const saved = await stagingService.saveProviderConnection({
      id,
      teamId: null, // Admin-level connection
      userId: null,
      channel: effectiveChannel,
      displayName,
      status: status || 'ACTIVE',
      config: mergedConfig,
      createdBy: createdBy || 'admin'
    });

    return res.status(201).json({
      ...saved,
      config: {
        ...saved.config,
        clientSecret: '••••••••',
        hasSecret: true
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/messages/admin/oauth2/:id - Delete an Admin OAuth2 Connection
messagesRouter.delete('/admin/oauth2/:id', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const deleted = await stagingService.deleteProviderConnection(req.params.id);
    return res.json({ success: deleted });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * ========================================================
 * External Requests Staging Queue & Maker-Checker Endpoints
 * ========================================================
 */

// GET /api/messages/staging - List staged external requests with filters
messagesRouter.get('/staging', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const teamId = req.query.teamId as string | undefined;
    const assignedUserId = req.query.assignedUserId as string | undefined;
    const status = req.query.status as string | undefined;
    const urgency = req.query.urgency as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const staged = await stagingService.getStagedMessages({
      teamId,
      assignedUserId,
      status,
      urgency,
      limit
    });
    return res.json(staged);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/messages/staging/:id - Single staged item inspection
messagesRouter.get('/staging/:id', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const item = await stagingService.getStagedMessageById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Staged message not found.' });
    }
    return res.json(item);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/staging/:id/propose - Maker proposes task conversion
messagesRouter.post('/staging/:id/propose', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const { makerId, makerName, title, teamId, priority, notes } = req.body;
    if (!makerId) {
      return res.status(400).json({ error: 'makerId is required to propose task conversion.' });
    }

    const updated = await stagingService.proposeTaskConversion(
      req.params.id,
      { id: makerId, name: makerName || 'Operational Maker' },
      { title, teamId, priority, notes }
    );
    return res.json({ success: true, staged: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/staging/:id/approve - Checker approves task conversion (Anti-Self-Approval enforced)
messagesRouter.post('/staging/:id/approve', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const { checkerId, checkerName, reviewNotes } = req.body;
    if (!checkerId) {
      return res.status(400).json({ error: 'checkerId is required.' });
    }

    const result = await stagingService.approveAndConvertTask(
      req.params.id,
      { id: checkerId, name: checkerName || 'Operational Supervisor' },
      reviewNotes
    );
    return res.json({ success: true, ...result });
  } catch (err: any) {
    if (err.message.includes('Anti-Self-Approval')) {
      return res.status(403).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/staging/:id/reject - Reject staged request
messagesRouter.post('/staging/:id/reject', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const { actorId, actorName, reason } = req.body;
    const updated = await stagingService.rejectStagedMessage(
      req.params.id,
      { id: actorId || 'sys', name: actorName || 'Reviewer' },
      reason || 'Rejected during triage'
    );
    return res.json({ success: true, staged: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/staging/:id/create-task - Direct conversion or approval
messagesRouter.post('/staging/:id/create-task', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const { actorId, actorName, notes } = req.body;
    const result = await stagingService.approveAndConvertTask(
      req.params.id,
      { id: actorId || 'usr-supervisor', name: actorName || 'Lead Operator' },
      notes
    );
    return res.json({ success: true, ...result });
  } catch (err: any) {
    if (err.message.includes('Anti-Self-Approval')) {
      return res.status(403).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/staging/:id/escalate - Escalate to another team
messagesRouter.post('/staging/:id/escalate', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const { targetTeamId, actorId, actorName, reason } = req.body;
    if (!targetTeamId) {
      return res.status(400).json({ error: 'targetTeamId is required.' });
    }

    const updated = await stagingService.escalateStagedMessage(
      req.params.id,
      targetTeamId,
      { id: actorId || 'operator', name: actorName || 'Lead' },
      reason || 'Escalated from triage queue'
    );
    return res.json({ success: true, staged: updated });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/messages/summary or /api/external-requests/summary - Summary dashboard metrics
messagesRouter.get('/summary', async (req: Request, res: Response) => {
  try {
    const { stagingService } = await import('../services/messaging/stagingService.js');
    const teamId = req.query.teamId as string | undefined;
    const summary = await stagingService.getExternalRequestSummary(teamId);
    return res.json(summary);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * ========================================================
 * Team Mailbox, Threading & Task Linking Endpoints
 * ========================================================
 */

// GET /api/messages/mailbox - Consolidated thread-aware team or personal mailbox
messagesRouter.get('/mailbox', async (req: Request, res: Response) => {
  try {
    const teamId = req.query.teamId as string | undefined;
    const userId = req.query.userId as string | undefined;
    const filter = (req.query.filter as any) || 'all';
    const search = req.query.search as string | undefined;

    if (userId && !teamId) {
      const sync = req.query.sync === 'true';
      const threads = await messageIntakeService.getUserMailbox(userId, filter, search, sync);
      return res.json(threads);
    }

    const threads = await messageIntakeService.getTeamMailbox(teamId || '', filter, search);
    return res.json(threads);
  } catch (err: any) {
    console.error('[messagesRouter] Error fetching mailbox:', err);
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/messages/:messageId/link-issue - Link message and its thread to a newly created/existing issue
messagesRouter.put('/:messageId/link-issue', async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const { issueId } = req.body;
    if (!issueId) {
      return res.status(400).json({ error: 'issueId is required.' });
    }

    const linked = await messageIntakeService.linkMessageToIssue(messageId, issueId);
    return res.json({ success: linked, messageId, issueId });
  } catch (err: any) {
    console.error('[messagesRouter] Error linking message to issue:', err);
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/reply - Reply directly within a mailbox thread
messagesRouter.post('/reply', async (req: Request, res: Response) => {
  try {
    const { teamId, userId, channel, to, subject, textBody, htmlBody, conversationId, threadId, inReplyToMessageId, senderAddress } = req.body;
    if (!to || !textBody) {
      return res.status(400).json({ error: 'Recipient "to" and "textBody" are required.' });
    }

    let finalSenderAddress = senderAddress;
    if (!finalSenderAddress && userId) {
      const userRes = await getPostgresPool().query(
        `SELECT email, message_provider_settings FROM users WHERE id = $1;`,
        [userId]
      );
      const u = userRes.rows[0];
      finalSenderAddress = u?.message_provider_settings?.userEmail || u?.email;
    }

    const result = await messageIntakeService.replyToMessage(teamId || '', {
      channel: channel || 'email',
      to,
      subject: subject || 'Re: Message',
      textBody,
      htmlBody,
      conversationId,
      threadId,
      inReplyToMessageId,
      senderAddress: finalSenderAddress
    });

    return res.status(201).json({ success: true, ...result });
  } catch (err: any) {
    console.error('[messagesRouter] Error sending reply:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * ========================================================
 * User Contacts & Multi-Channel Identifiers Endpoints
 * ========================================================
 */

// GET /api/messages/contacts - List user contacts with their channel identifiers
messagesRouter.get('/contacts', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    const pool = getPostgresPool();
    const contactsRes = await pool.query(
      `SELECT c.*, 
        COALESCE(
          json_agg(
            json_build_object(
              'id', ci.id,
              'channel', ci.channel,
              'identifierValue', ci.identifier_value,
              'label', ci.label,
              'isPrimary', ci.is_primary,
              'createdAt', ci.created_at
            )
          ) FILTER (WHERE ci.id IS NOT NULL), '[]'
        ) as identifiers
       FROM user_contacts c
       LEFT JOIN contact_identifiers ci ON ci.contact_id = c.id
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY c.name ASC;`,
      [userId]
    );
    return res.json(contactsRes.rows);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/contacts - Create or update contact
messagesRouter.post('/contacts', async (req: Request, res: Response) => {
  try {
    const { id, userId, name, organization, roleOrTitle, primaryEmail, primaryPhone, avatarUrl, notes, initialIdentifier } = req.body;
    if (!userId || !name) {
      return res.status(400).json({ error: 'userId and name are required' });
    }
    const pool = getPostgresPool();
    const contactId = id || `cnt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    
    await pool.query(
      `INSERT INTO user_contacts (id, user_id, name, organization, role_or_title, primary_email, primary_phone, avatar_url, notes, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         organization = EXCLUDED.organization,
         role_or_title = EXCLUDED.role_or_title,
         primary_email = EXCLUDED.primary_email,
         primary_phone = EXCLUDED.primary_phone,
         avatar_url = EXCLUDED.avatar_url,
         notes = EXCLUDED.notes,
         updated_at = NOW();`,
      [contactId, userId, name, organization || null, roleOrTitle || null, primaryEmail || null, primaryPhone || null, avatarUrl || null, notes || null]
    );

    // If initialIdentifier provided (e.g. channel and identifierValue)
    if (initialIdentifier?.channel && initialIdentifier?.identifierValue) {
      const identId = `ident-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      await pool.query(
        `INSERT INTO contact_identifiers (id, contact_id, channel, identifier_value, label, is_primary)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (id) DO NOTHING;`,
        [identId, contactId, initialIdentifier.channel, initialIdentifier.identifierValue, initialIdentifier.label || 'Primary']
      );
    }

    return res.status(201).json({ id: contactId, success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/messages/contacts/:id/identifiers - Add additional ID to a contact
messagesRouter.post('/contacts/:id/identifiers', async (req: Request, res: Response) => {
  try {
    const contactId = req.params.id;
    const { channel, identifierValue, label, isPrimary } = req.body;
    if (!channel || !identifierValue) {
      return res.status(400).json({ error: 'channel and identifierValue are required' });
    }
    const pool = getPostgresPool();
    const identId = `ident-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    await pool.query(
      `INSERT INTO contact_identifiers (id, contact_id, channel, identifier_value, label, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6);`,
      [identId, contactId, channel, identifierValue, label || channel.toUpperCase(), Boolean(isPrimary)]
    );
    return res.status(201).json({ id: identId, success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/messages/contacts/:id - Delete contact
messagesRouter.delete('/contacts/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPostgresPool();
    await pool.query(`DELETE FROM user_contacts WHERE id = $1;`, [req.params.id]);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/messages/contacts/identifiers/:id - Delete identifier
messagesRouter.delete('/contacts/identifiers/:id', async (req: Request, res: Response) => {
  try {
    const pool = getPostgresPool();
    await pool.query(`DELETE FROM contact_identifiers WHERE id = $1;`, [req.params.id]);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

