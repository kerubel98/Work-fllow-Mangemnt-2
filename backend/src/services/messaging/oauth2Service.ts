/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getPostgresPool } from '../../config/postgres.js';

export type OAuth2GrantType = 'client_credentials' | 'refresh_token' | 'authorization_code';

export interface OAuth2Config {
  authType?: 'OAUTH2' | 'BASIC' | 'API_KEY';
  providerPreset?: 'MICROSOFT_365' | 'GOOGLE_WORKSPACE' | 'ZOHO' | 'META' | 'CUSTOM';
  preset?: 'MICROSOFT_365' | 'GOOGLE_WORKSPACE' | 'ZOHO' | 'META' | 'CUSTOM';
  zohoRegion?: 'COM' | 'EU' | 'IN' | 'AU' | 'JP' | 'CA';
  grantType?: 'client_credentials' | 'refresh_token' | 'authorization_code';
  tenantId?: string;
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
  scope?: string;
  accessToken?: string;
  refreshToken?: string;
  code?: string; // Self-Client Grant token (from Zoho API console)
  tokenExpiry?: number; // epoch ms
  userEmail?: string;
}

export interface OAuth2TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  api_domain?: string;
}

export class OAuth2Service {
  /**
   * Resolves the token endpoint URL based on preset or custom config.
   */
  resolveTokenUrl(config: OAuth2Config): string {
    if (config.tokenUrl) return config.tokenUrl;
    const preset = config.providerPreset || config.preset;

    // Auto-detect Zoho if preset is ZOHO, or if clientId starts with 1000., or if tenantId/scope/user mentions zoho
    const isZoho = preset === 'ZOHO'
      || (config.clientId && config.clientId.startsWith('1000.'))
      || (config.tenantId && config.tenantId.toLowerCase().includes('zoho'))
      || (config.scope && config.scope.toLowerCase().includes('zohomail'))
      || (config.userEmail && config.userEmail.toLowerCase().includes('zoho'));

    if (isZoho) {
      if (config.tenantId && config.tenantId.includes('accounts.zoho')) {
        const cleanTenant = config.tenantId.replace(/\/oauth\/v2\/token\/?$/, '').replace(/^https?:\/\//, '');
        return `https://${cleanTenant}/oauth/v2/token`;
      }
      const reg = config.zohoRegion || 'COM';
      const domain = reg === 'EU' ? 'accounts.zoho.eu'
                   : reg === 'IN' ? 'accounts.zoho.in'
                   : reg === 'AU' ? 'accounts.zoho.com.au'
                   : reg === 'JP' ? 'accounts.zoho.jp'
                   : reg === 'CA' ? 'accounts.zohocloud.ca'
                   : 'accounts.zoho.com';
      return `https://${domain}/oauth/v2/token`;
    }

    if (preset === 'GOOGLE_WORKSPACE') {
      return 'https://oauth2.googleapis.com/token';
    }

    if (preset === 'META') {
      return 'https://graph.facebook.com/v19.0/oauth/access_token';
    }

    if (preset === 'MICROSOFT_365') {
      const tenant = config.tenantId || 'common';
      return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
    }

    if (config.tenantId && !config.tenantId.includes('zoho')) {
      return `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
    }

    throw new Error('OAuth2 Token URL is required for Custom provider configuration.');
  }

  /**
   * Resolves default OAuth2 scope.
   */
  resolveDefaultScope(config: OAuth2Config, channel: 'email' | 'teams' | 'whatsapp' | 'telegram'): string {
    if (config.scope) return config.scope;
    const preset = config.providerPreset || config.preset;

    if (preset === 'ZOHO' || (config.clientId && config.clientId.startsWith('1000.'))) {
      return 'ZohoMail.messages.ALL,ZohoMail.accounts.ALL';
    }

    if (channel === 'email' && preset === 'MICROSOFT_365') {
      return 'https://outlook.office365.com/.default';
    }

    if (channel === 'email' && preset === 'GOOGLE_WORKSPACE') {
      return 'https://mail.google.com/';
    }

    if (channel === 'teams' || preset === 'MICROSOFT_365') {
      return 'https://graph.microsoft.com/.default';
    }

    return 'https://graph.microsoft.com/.default';
  }

  /**
   * Requests a fresh access token using OAuth2 Client Credentials Grant.
   */
  async acquireTokenClientCredentials(config: OAuth2Config, channel: 'email' | 'teams' | 'whatsapp' | 'telegram' = 'email'): Promise<{
    accessToken: string;
    expiresIn: number;
    tokenExpiry: number;
    scope?: string;
  }> {
    const tokenUrl = this.resolveTokenUrl(config);
    const scope = this.resolveDefaultScope(config, channel);
    const clientId = config.clientId?.trim();
    const clientSecret = config.clientSecret?.trim();

    if (!clientId || !clientSecret) {
      throw new Error('OAuth2 Client Credentials Grant requires both clientId and clientSecret.');
    }

    const bodyParams = new URLSearchParams();
    bodyParams.append('grant_type', 'client_credentials');
    bodyParams.append('client_id', clientId);
    bodyParams.append('client_secret', clientSecret);
    bodyParams.append('scope', scope);

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: bodyParams.toString()
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr: any = null;
      try { parsedErr = JSON.parse(errText); } catch {}
      const errMsg = parsedErr?.error_description || parsedErr?.error || errText || `HTTP ${response.status}`;
      throw new Error(`OAuth2 Token Request Failed (${response.status}): ${errMsg}`);
    }

    const data = (await response.json()) as OAuth2TokenResponse;
    if ((data as any).error) {
      const desc = (data as any).error_description || (data as any).error;
      throw new Error(`OAuth2 Token Error: ${desc}`);
    }

    const expiresIn = data.expires_in || 3600;
    const tokenExpiry = Date.now() + expiresIn * 1000;

    return {
      accessToken: data.access_token,
      expiresIn,
      tokenExpiry,
      scope: data.scope || scope
    };
  }

  /**
   * Refreshes access token using Refresh Token Grant.
   */
  async acquireTokenRefreshToken(config: OAuth2Config): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    tokenExpiry: number;
  }> {
    const refreshToken = config.refreshToken?.trim();
    const clientId = config.clientId?.trim();
    const clientSecret = config.clientSecret?.trim();

    if (!refreshToken) {
      throw new Error('OAuth2 Refresh Token Grant requires refreshToken.');
    }
    if (!clientId || !clientSecret) {
      throw new Error('OAuth2 Refresh Token Grant requires both clientId and clientSecret.');
    }

    const tokenUrl = this.resolveTokenUrl(config);
    const bodyParams = new URLSearchParams();
    bodyParams.append('grant_type', 'refresh_token');
    bodyParams.append('client_id', clientId);
    bodyParams.append('client_secret', clientSecret);
    bodyParams.append('refresh_token', refreshToken);
    if (config.scope) bodyParams.append('scope', config.scope);

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: bodyParams.toString()
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr: any = null;
      try { parsedErr = JSON.parse(errText); } catch {}
      const errMsg = parsedErr?.error_description || parsedErr?.error || errText || `HTTP ${response.status}`;
      throw new Error(`OAuth2 Refresh Token Failed (${response.status}): ${errMsg}`);
    }

    const data = (await response.json()) as OAuth2TokenResponse;
    if ((data as any).error) {
      const desc = (data as any).error_description || (data as any).error;
      throw new Error(`OAuth2 Refresh Token Error: ${desc}`);
    }

    const expiresIn = data.expires_in || 3600;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn,
      tokenExpiry: Date.now() + expiresIn * 1000
    };
  }

  /**
   * Exchanges an authorization code (or Zoho Self-Client grant token) for an access token and refresh token.
   */
  async acquireTokenAuthorizationCode(config: OAuth2Config): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresIn: number;
    tokenExpiry: number;
    scope?: string;
  }> {
    const code = config.code?.trim();
    const clientId = config.clientId?.trim();
    const clientSecret = config.clientSecret?.trim();

    if (!code) {
      throw new Error('OAuth2 Authorization Code Grant requires code (grant token).');
    }
    if (!clientId || !clientSecret) {
      throw new Error('OAuth2 requires both clientId and clientSecret.');
    }

    const tokenUrl = this.resolveTokenUrl(config);
    const bodyParams = new URLSearchParams();
    bodyParams.append('grant_type', 'authorization_code');
    bodyParams.append('client_id', clientId);
    bodyParams.append('client_secret', clientSecret);
    bodyParams.append('code', code);
    if (config.scope) bodyParams.append('scope', config.scope);

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: bodyParams.toString()
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr: any = null;
      try { parsedErr = JSON.parse(errText); } catch {}
      const errMsg = parsedErr?.error_description || parsedErr?.error || errText || `HTTP ${response.status}`;
      throw new Error(`OAuth2 Authorization Code Failed (${response.status}): ${errMsg}`);
    }

    const data = (await response.json()) as OAuth2TokenResponse;
    if ((data as any).error) {
      const desc = (data as any).error_description || (data as any).error;
      throw new Error(`OAuth2 Code Exchange Error: ${desc}`);
    }

    const expiresIn = data.expires_in || 3600;

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn,
      tokenExpiry: Date.now() + expiresIn * 1000,
      scope: data.scope
    };
  }

  /**
   * Returns a valid access token. If cached token is expired or expiring within 5 minutes,
   * automatically re-acquires a fresh token and updates provider config in DB.
   */
  async getValidAccessToken(
    providerId: string | null,
    config: OAuth2Config,
    channel: 'email' | 'teams' | 'whatsapp' | 'telegram'
  ): Promise<string> {
    const bufferMs = 5 * 60 * 1000; // 5 minute safety buffer
    const isStillValid = config.accessToken && config.tokenExpiry && Date.now() < config.tokenExpiry - bufferMs;

    if (isStillValid) {
      return config.accessToken!;
    }

    // Refresh token grant or code exchange if available
    let tokenResult: { accessToken: string; tokenExpiry: number; refreshToken?: string };
    if (config.refreshToken) {
      tokenResult = await this.acquireTokenRefreshToken(config);
    } else if (config.code) {
      tokenResult = await this.acquireTokenAuthorizationCode(config);
      if (tokenResult.refreshToken) {
        config.refreshToken = tokenResult.refreshToken;
      }
    } else {
      tokenResult = await this.acquireTokenClientCredentials(config, channel);
    }

    // Update in-memory config
    config.accessToken = tokenResult.accessToken;
    config.tokenExpiry = tokenResult.tokenExpiry;

    // Persist updated token to PostgreSQL provider_connections if providerId is supplied
    if (providerId) {
      try {
        const pool = getPostgresPool();
        await pool.query(
          `UPDATE provider_connections
           SET config = jsonb_set(
             jsonb_set(
               jsonb_set(config, '{accessToken}', to_jsonb($1::text)),
               '{tokenExpiry}', to_jsonb($2::bigint)
             ),
             '{refreshToken}', to_jsonb($3::text)
           ),
           updated_at = NOW()
           WHERE id = $4;`,
          [
            tokenResult.accessToken, 
            tokenResult.tokenExpiry, 
            config.refreshToken || tokenResult.refreshToken || '',
            providerId
          ]
        );
      } catch (dbErr: any) {
        console.warn(`[OAuth2Service] Could not persist refreshed token to DB for ${providerId}:`, dbErr.message);
      }
    }

    return tokenResult.accessToken;
  }

  /**
   * Generates SASL XOAUTH2 token buffer for IMAP / SMTP modern authentication:
   * Format: "user=" + user + "\x01auth=Bearer " + accessToken + "\x01\x01"
   */
  buildXOAuth2Token(user: string, accessToken: string): string {
    const authString = `user=${user}\x01auth=Bearer ${accessToken}\x01\x01`;
    return Buffer.from(authString).toString('base64');
  }

  /**
   * Tests an OAuth2 configuration and returns verification status with token details.
   */
  async testOAuth2Credentials(
    config: OAuth2Config,
    channel: 'email' | 'teams' | 'whatsapp' | 'telegram' = 'email'
  ): Promise<{
    success: boolean;
    message: string;
    details?: {
      tokenEndpoint: string;
      scope: string;
      expiresIn: number;
      tokenExpiryDate: string;
      tokenPrefix: string;
      hasRefreshToken?: boolean;
    };
  }> {
    try {
      let result: {
        accessToken: string;
        expiresIn: number;
        tokenExpiry: number;
        scope?: string;
        refreshToken?: string;
      };

      if (config.code || config.grantType === 'authorization_code') {
        result = await this.acquireTokenAuthorizationCode(config);
      } else if (config.refreshToken || config.grantType === 'refresh_token') {
        result = await this.acquireTokenRefreshToken(config);
      } else {
        result = await this.acquireTokenClientCredentials(config, channel);
      }

      return {
        success: true,
        message: `OAuth 2.0 Modern Authentication Successful! Received access token valid for ${Math.round(result.expiresIn / 60)} minutes.${result.refreshToken || config.refreshToken ? ' Refresh Token verified.' : ''}`,
        details: {
          tokenEndpoint: this.resolveTokenUrl(config),
          scope: result.scope || this.resolveDefaultScope(config, channel),
          expiresIn: result.expiresIn,
          tokenExpiryDate: new Date(result.tokenExpiry).toISOString(),
          tokenPrefix: result.accessToken.substring(0, 10) + '...',
          hasRefreshToken: !!(result.refreshToken || config.refreshToken)
        }
      };
    } catch (err: any) {
      return {
        success: false,
        message: `OAuth 2.0 Authentication Failed: ${err.message}`
      };
    }
  }
}

export const oauth2Service = new OAuth2Service();
