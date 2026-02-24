import { logger } from './logger.js';
import type { QueuedMessage, ReadableMessage } from './types.js';

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_QUEUE_SIZE = 500;
const EVICTION_INTERVAL_MS = 60 * 1000; // 1 minute

export class MessageBus {
  private queues: Map<string, QueuedMessage[]> = new Map();
  private ttlMs: number;
  private evictionTimer: NodeJS.Timeout | null = null;

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  start() {
    this.evictionTimer = setInterval(() => this.evictExpired(), EVICTION_INTERVAL_MS);
    logger.info(`Message bus started (TTL: ${this.ttlMs / 1000}s)`);
  }

  stop() {
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
      this.evictionTimer = null;
    }
    this.queues.clear();
  }

  /**
   * Push a message into an entity's queue.
   */
  push(entityId: string, message: Omit<QueuedMessage, 'expiresAt'>): void {
    let queue = this.queues.get(entityId);
    if (!queue) {
      queue = [];
      this.queues.set(entityId, queue);
    }

    queue.push({
      ...message,
      expiresAt: new Date(Date.now() + this.ttlMs),
    });

    // Cap queue size — drop oldest if over limit
    if (queue.length > MAX_QUEUE_SIZE) {
      const dropped = queue.length - MAX_QUEUE_SIZE;
      queue.splice(0, dropped);
      logger.warn(`Queue overflow for entity ${entityId}: dropped ${dropped} oldest messages`);
    }
  }

  /**
   * Read messages from an entity's queue (does NOT remove them — TTL handles expiry).
   */
  read(entityId: string, channelId?: string, limit = 50): ReadableMessage[] {
    const queue = this.queues.get(entityId);
    if (!queue) return [];

    const now = Date.now();
    let messages = queue.filter(m => m.expiresAt.getTime() > now);

    if (channelId) {
      messages = messages.filter(m => m.channelId === channelId);
    }

    // Most recent first, apply limit
    const sliced = messages.slice(-limit);

    return sliced.map(m => ({
      id: m.messageId,
      channel_id: m.channelId,
      server_id: m.serverId,
      author_id: m.authorId,
      author_name: m.authorName,
      content: m.content,
      timestamp: m.timestamp.toISOString(),
    }));
  }

  /**
   * Evict expired messages from all queues.
   */
  private evictExpired(): void {
    const now = Date.now();
    let totalEvicted = 0;

    for (const [entityId, queue] of this.queues) {
      const before = queue.length;
      const filtered = queue.filter(m => m.expiresAt.getTime() > now);
      totalEvicted += before - filtered.length;

      if (filtered.length === 0) {
        this.queues.delete(entityId);
      } else {
        this.queues.set(entityId, filtered);
      }
    }

    if (totalEvicted > 0) {
      logger.debug(`Evicted ${totalEvicted} expired messages`);
    }
  }

  /**
   * Get queue stats for debugging/health checks.
   */
  stats(): Record<string, { count: number; oldestAge: number }> {
    const now = Date.now();
    const result: Record<string, { count: number; oldestAge: number }> = {};
    for (const [entityId, queue] of this.queues) {
      const active = queue.filter(m => m.expiresAt.getTime() > now);
      result[entityId] = {
        count: active.length,
        oldestAge: active.length > 0 ? now - active[0].timestamp.getTime() : 0,
      };
    }
    return result;
  }
}
