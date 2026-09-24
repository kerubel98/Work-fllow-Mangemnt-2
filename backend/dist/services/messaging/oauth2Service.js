/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { getPostgresPool } from '../../config/postgres.js';
export class OAuth2Service {
    /**
     * Resolves the token endpoint URL based on preset or custom config.
     */
    resolveTokenUrl(config) {
        if (config.tokenUrl)
            return config.tokenUrl;
        if (config.providerPreset === 'MICROSOFT_365' || config.tenantId) {
            const tenant = config.tenantId || 'common';
            return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
        }
        if (config.providerPreset === 'GOOGLE_WORKSPACE') {
            return 'https://oauth2.googleapis.com/token';
        }
        if (config.providerPreset === 'META') {
            return 'https://graph.facebook.com/v19.0/oauth/access_token';
        }
        return config.tokenUrl || 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
    }
    /**
     * Resolves default OAuth2 scope.
     */
    resolveDefaultScope(config, channel) {
        if (config.scope)
            return config.scope;
        if (channel === 'email' && config.providerPreset === 'MICROSOFT_365') {
            return 'https://outlook.office365.com/.default';
        }
        if (channel === 'email' && config.providerPreset === 'GOOGLE_WORKSPACE') {
            return 'https://mail.google.com/';
        }
        if (channel === 'teams' || config.providerPreset === 'MICROSOFT_365') {
            return 'https://graph.microsoft.com/.default';
        }
        return 'https://graph.microsoft.com/.default';
    }
    /**
     * Requests a fresh access token using OAuth2 Client Credentials Grant.
     */
    async acquireTokenClientCredentials(config, channel = 'email') {
        const tokenUrl = this.resolveTokenUrl(config);
        const scope = this.resolveDefaultScope(config, channel);
        if (!config.clientId || !config.clientSecret) {
            throw new Error('OAuth2 Client Credentials Grant requires both clientId and clientSecret.');
        }
        const bodyParams = new URLSearchParams();
        bodyParams.append('grant_type', 'client_credentials');
        bodyParams.append('client_id', config.clientId);
        bodyParams.append('client_secret', config.clientSecret);
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
            let parsedErr = null;
            try {
                parsedErr = JSON.parse(errText);
            }
            catch { }
            const errMsg = parsedErr?.error_description || parsedErr?.error || errText || `HTTP ${response.status}`;
            throw new Error(`OAuth2 Token Request Failed (${response.status}): ${errMsg}`);
        }
        const data = (await response.json());
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
    async acquireTokenRefreshToken(config) {
        if (!config.refreshToken) {
            throw new Error('OAuth2 Refresh Token Grant requires refreshToken.');
        }
        const tokenUrl = this.resolveTokenUrl(config);
        const bodyParams = new URLSearchParams();
        bodyParams.append('grant_type', 'refresh_token');
        bodyParams.append('refresh_token', config.refreshToken);
        if (config.clientId)
            bodyParams.append('client_id', config.clientId);
        if (config.clientSecret)
            bodyParams.append('client_secret', config.clientSecret);
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
            throw new Error(`OAuth2 Refresh Token Failed (${response.status}): ${errText}`);
        }
        const data = (await response.json());
        const expiresIn = data.expires_in || 3600;
        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || config.refreshToken,
            expiresIn,
            tokenExpiry: Date.now() + expiresIn * 1000
        };
    }
    /**
     * Returns a valid access token. If cached token is expired or expiring within 5 minutes,
     * automatically re-acquires a fresh token and updates provider config in DB.
     */
    async getValidAccessToken(providerId, config, channel) {
        const bufferMs = 5 * 60 * 1000; // 5 minute safety buffer
        const isStillValid = config.accessToken && config.tokenExpiry && Date.now() < config.tokenExpiry - bufferMs;
        if (isStillValid) {
            return config.accessToken;
        }
        // Refresh token grant if available
        let tokenResult;
        if (config.refreshToken) {
            tokenResult = await this.acquireTokenRefreshToken(config);
        }
        else {
            tokenResult = await this.acquireTokenClientCredentials(config, channel);
        }
        // Update in-memory config
        config.accessToken = tokenResult.accessToken;
        config.tokenExpiry = tokenResult.tokenExpiry;
        // Persist updated token to PostgreSQL provider_connections if providerId is supplied
        if (providerId) {
            try {
                const pool = getPostgresPool();
                await pool.query(`UPDATE provider_connections
           SET config = jsonb_set(
             jsonb_set(config, '{accessToken}', to_jsonb($1::text)),
             '{tokenExpiry}', to_jsonb($2::bigint)
           ),
           updated_at = NOW()
           WHERE id = $3;`, [tokenResult.accessToken, tokenResult.tokenExpiry, providerId]);
            }
            catch (dbErr) {
                console.warn(`[OAuth2Service] Could not persist refreshed token to DB for ${providerId}:`, dbErr.message);
            }
        }
        return tokenResult.accessToken;
    }
    /**
     * Generates SASL XOAUTH2 token buffer for IMAP / SMTP modern authentication:
     * Format: "user=" + user + "\x01auth=Bearer " + accessToken + "\x01\x01"
     */
    buildXOAuth2Token(user, accessToken) {
        const authString = `user=${user}\x01auth=Bearer ${accessToken}\x01\x01`;
        return Buffer.from(authString).toString('base64');
    }
    /**
     * Tests an OAuth2 configuration and returns verification status with token details.
     */
    async testOAuth2Credentials(config, channel = 'email') {
        try {
            const result = await this.acquireTokenClientCredentials(config, channel);
            return {
                success: true,
                message: `OAuth 2.0 Modern Authentication Successful! Received access token valid for ${Math.round(result.expiresIn / 60)} minutes.`,
                details: {
                    tokenEndpoint: this.resolveTokenUrl(config),
                    scope: result.scope || this.resolveDefaultScope(config, channel),
                    expiresIn: result.expiresIn,
                    tokenExpiryDate: new Date(result.tokenExpiry).toISOString(),
                    tokenPrefix: result.accessToken.substring(0, 10) + '...'
                }
            };
        }
        catch (err) {
            return {
                success: false,
                message: `OAuth 2.0 Authentication Failed: ${err.message}`
            };
        }
    }
}
export const oauth2Service = new OAuth2Service();
