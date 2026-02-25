import { logger } from './logger.js';

/**
 * Volatile in-memory store for per-entity encryption keys.
 * Keys are 32-byte AES-256 buffers derived from API keys via HKDF.
 * NEVER persisted to disk or database. Process restart = empty store.
 */
class KeyStore {
  private keys: Map<string, Buffer> = new Map();

  set(entityId: string, key: Buffer): void {
    this.keys.set(entityId, key);
    logger.debug(`Encryption key cached for entity ${entityId}`);
  }

  get(entityId: string): Buffer | undefined {
    return this.keys.get(entityId);
  }

  has(entityId: string): boolean {
    return this.keys.has(entityId);
  }

  delete(entityId: string): void {
    this.keys.delete(entityId);
  }

  clear(): void {
    this.keys.clear();
  }
}

export const keyStore = new KeyStore();
