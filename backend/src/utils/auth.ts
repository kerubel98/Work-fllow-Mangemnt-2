import crypto from 'node:crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'op_workflow_secret_key_prod_2026_x89f_secure_auth';

export interface JwtUserPayload {
  id: string;
  username: string;
  email: string;
  role: string;
  isApproved: boolean;
  canExecuteSelect?: boolean;
  canExecuteUpdate?: boolean;
  iat?: number;
  exp?: number;
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
 * Verifies a password against a salted PBKDF2 hash or plaintext fallback for seeded users.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash) return false;
  
  // If stored as salt:hash
  if (storedHash.includes(':')) {
    const [salt, originalHash] = storedHash.split(':');
    if (!salt || !originalHash) return false;
    const testHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(testHash, 'hex'), Buffer.from(originalHash, 'hex'));
  }

  // Plaintext fallback for initial mock users (admin123, tech123, etc.)
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
    .createHmac('sha256', JWT_SECRET)
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
      .createHmac('sha256', JWT_SECRET)
      .update(data)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    if (signature !== expectedSignature) {
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
