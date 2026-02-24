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
