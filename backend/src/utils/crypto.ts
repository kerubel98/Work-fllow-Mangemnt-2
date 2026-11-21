import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const PREFIX = 'enc:v1:';

function getEncryptionKey(): Buffer {
  const secret = process.env.DB_ENCRYPTION_KEY || process.env.JWT_SECRET || 'master-operational-db-secret-encryption-key-32b';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts sensitive connection credentials using AES-256-GCM.
 * Idempotent: If already encrypted (starts with enc:v1:), returns input unchanged.
 */
export function encryptSecret(plaintext?: string | null): string | null {
  if (!plaintext) return null;
  if (plaintext.startsWith(PREFIX)) return plaintext;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);

  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts sensitive credentials previously encrypted with encryptSecret.
 * If not encrypted (does not start with enc:v1:), returns plaintext unchanged for migration compatibility.
 */
export function decryptSecret(ciphertext?: string | null): string | null {
  if (!ciphertext) return null;
  if (!ciphertext.startsWith(PREFIX)) return ciphertext;

  try {
    const parts = ciphertext.substring(PREFIX.length).split(':');
    if (parts.length !== 3) return ciphertext;

    const [ivHex, tagHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    const key = getEncryptionKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);

    return decrypted.toString('utf8');
  } catch (err: any) {
    console.error('[Crypto] Decryption failure:', err.message);
    return null;
  }
}

/**
 * Masks a secret string for API responses.
 */
export function maskSecret(secret?: string | null): string | undefined {
  if (!secret) return undefined;
  return '••••••••';
}

