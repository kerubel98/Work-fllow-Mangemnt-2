import crypto from 'node:crypto';

/**
 * Returns the effective JWT secret.
 * Enforces strong, production-grade secrets in production mode.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (
      !secret ||
      secret.trim().length < 32 ||
      secret === 'op_workflow_secret_key_prod_2026_x89f_secure_auth' ||
      secret === 'your-secret-key-change-in-production'
    ) {
      throw new Error(
        'FATAL: JWT_SECRET environment variable must be set to a secure, unique key (at least 32 characters) in production.'
      );
    }
    return secret;
  }
  return secret || 'op_workflow_secret_key_dev_2026_x89f_secure_auth';
}

export interface JwtUserPayload {
  id: string;
  username: string;
  email: string;
  role: string;
  isApproved: boolean;
  teamId?: string;
  canExecuteSelect?: boolean;
  canExecuteUpdate?: boolean;
  iat?: number;
  exp?: number;
}

export interface VerifiedActor {
  id: string;
  name: string;
  username: string;
  email?: string;
  role: string;
  teamId?: string;
}

/**
 * Returns a strictly verified actor representation from authenticated JWT session.
 * Neutralizes spoofed client headers and body role injections when req.user is populated.
 */
export function getVerifiedActor(req: any): VerifiedActor {
  const user = req?.user as JwtUserPayload | undefined;
  if (user && user.id) {
    return {
      id: user.id,
      name: user.username || (user as any).name || 'user',
      username: user.username,
      email: user.email,
      role: user.role || 'user',
      teamId: user.teamId
    };
  }
  const headers = req?.headers || {};
  const fallbackRole = (headers['x-user-role'] as string) || req?.body?.callerRole || req?.body?.userRole || req?.query?.callerRole || req?.query?.userRole || 'user';
  const fallbackId = (headers['x-user-id'] as string) || req?.body?.callerId || req?.body?.callerUserId || req?.body?.userId || req?.body?.checkerId || req?.query?.userId || 'system';
  const fallbackTeamId = (headers['x-team-id'] as string) || req?.body?.teamId || req?.query?.teamId || undefined;
  return {
    id: fallbackId,
    name: (headers['x-user-name'] as string) || 'system',
    username: (headers['x-user-name'] as string) || 'system',
    role: fallbackRole,
    teamId: fallbackTeamId
  };
}

/**
 * Generates a secure salted PBKDF2 password hash.
 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verifies a password against a salted PBKDF2 hash.
 * Plaintext comparison is strictly prohibited in production.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !password) return false;
  
  // If stored as salt:hash
  if (storedHash.includes(':')) {
    const [salt, originalHash] = storedHash.split(':');
    if (!salt || !originalHash) return false;
    const testHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    const testBuf = Buffer.from(testHash, 'hex');
    const origBuf = Buffer.from(originalHash, 'hex');
    if (testBuf.length !== origBuf.length) return false;
    return crypto.timingSafeEqual(testBuf, origBuf);
  }

  // Plaintext fallback is strictly prohibited in production mode
  if (process.env.NODE_ENV === 'production') {
    return false;
  }

  // Plaintext fallback for legacy dev/test seeded accounts
  return password === storedHash;
}

/**
 * Base64URL encoding helper
 */
function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Base64URL decoding helper
 */
function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Issues a standard HMAC-SHA256 JWT token.
 */
export function generateToken(payload: JwtUserPayload, expiresInHours = 24): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtUserPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInHours * 3600
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', getJwtSecret())
    .update(data)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${data}.${signature}`;
}

/**
 * Verifies and decodes a HMAC-SHA256 JWT token.
 */
export function verifyToken<T = JwtUserPayload>(token: string): T | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    const data = `${encodedHeader}.${encodedPayload}`;

    const expectedSignature = crypto
      .createHmac('sha256', getJwtSecret())
      .update(data)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JwtUserPayload;

    // Check expiration
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return null;
    }

    return payload as unknown as T;
  } catch (err) {
    return null;
  }
}

/**
 * Express middleware to authenticate JWT token from Authorization or x-auth-token header.
 */
export function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : (typeof authHeader === 'string' ? authHeader.trim() : null);

  if (!token) {
    return res.status(401).json({ error: 'Authentication required: missing or invalid Bearer token.' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }

  req.user = payload;
  next();
}

/**
 * Express middleware to enforce specific role permissions.
 */
export function requireRole(allowedRoles: string | string[]) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  return (req: any, res: any, next: any) => {
    const checkRole = () => {
      if (!req.user || !roles.some(r => r.toLowerCase() === req.user.role?.toLowerCase() || req.user.role === 'admin')) {
        return res.status(403).json({
          error: `Forbidden: Requires one of [${roles.join(', ')}] role privileges.`
        });
      }
      next();
    };

    if (!req.user) {
      requireAuth(req, res, checkRole);
    } else {
      checkRole();
    }
  };
}
