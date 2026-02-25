import crypto from 'node:crypto';
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;

/**
 * Generate a random API key (64 hex characters = 32 bytes).
 */
export function generateApiKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a random salt for HKDF key derivation (32 hex characters = 16 bytes).
 */
export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Hash an API key with bcrypt (for storage).
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  return bcrypt.hash(apiKey, BCRYPT_ROUNDS);
}

/**
 * Verify an API key against a bcrypt hash.
 */
export async function verifyApiKey(apiKey: string, hash: string): Promise<boolean> {
  return bcrypt.compare(apiKey, hash);
}

/**
 * Timing-safe string comparison (for non-bcrypt comparisons).
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Derive a 32-byte AES-256 encryption key from an API key + salt using HKDF-SHA256.
 * The key is used for per-entity message encryption in the in-memory queue.
 */
export function deriveEncryptionKey(apiKey: string, salt: string): Buffer {
  return Buffer.from(crypto.hkdfSync(
    'sha256',
    Buffer.from(apiKey, 'utf-8'),
    Buffer.from(salt, 'hex'),
    Buffer.from('entity-msg-encryption', 'utf-8'),
    32,
  ));
}

/**
 * Encrypt plaintext using AES-256-GCM. Returns base64(iv:12 + ciphertext + authTag:16).
 */
export function encryptContent(key: Buffer, plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]).toString('base64');
}

/**
 * Decrypt AES-256-GCM data produced by encryptContent. Input is base64(iv:12 + ciphertext + authTag:16).
 */
export function decryptContent(key: Buffer, data: string): string {
  const buf = Buffer.from(data, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const ciphertext = buf.subarray(12, buf.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final('utf-8');
}
