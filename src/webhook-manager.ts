import { Client, type Webhook, type TextChannel } from 'discord.js';
import { logger } from './logger.js';

const WEBHOOK_NAME = 'Arachne';

/** Append cache-busting param so Discord re-fetches the avatar on each webhook call. */
function bustAvatarCache(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_=${Date.now()}`;
}

const SENT_MSG_TTL_MS = 15 * 60 * 1000; // 15 minutes, matches message bus
const SENT_MSG_EVICT_INTERVAL_MS = 60 * 1000;

export class WebhookManager {
  private cache: Map<string, Webhook> = new Map();
  private pending: Map<string, Promise<Webhook>> = new Map();
  private client: Client;

  /** Track which entity sent which message (for reply notifications). */
  private sentMessages: Map<string, { entityId: string; expiresAt: number }> = new Map();
  private evictionTimer: NodeJS.Timeout | null = null;

  constructor(client: Client) {
    this.client = client;
    this.evictionTimer = setInterval(() => this.evictExpiredSentMessages(), SENT_MSG_EVICT_INTERVAL_MS);
  }

  /** Record that a message was sent by an entity. */
  private trackSentMessage(messageId: string, entityId: string): void {
    this.sentMessages.set(messageId, { entityId, expiresAt: Date.now() + SENT_MSG_TTL_MS });
  }

  /** Look up which entity sent a message (if still tracked). */
  getEntityForMessage(messageId: string): string | null {
    const entry = this.sentMessages.get(messageId);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.sentMessages.delete(messageId);
      return null;
    }
    return entry.entityId;
  }

  private evictExpiredSentMessages(): void {
    const now = Date.now();
    for (const [msgId, entry] of this.sentMessages) {
      if (now > entry.expiresAt) this.sentMessages.delete(msgId);
    }
  }

  /**
   * Get or create a webhook for a channel.
   * Uses a pending-promise map to prevent duplicate webhook creation from concurrent requests.
   */
  private async getWebhook(channelId: string): Promise<Webhook> {
    // Check cache
    const cached = this.cache.get(channelId);
    if (cached) return cached;

    // If another request is already fetching/creating for this channel, wait on it
    const inflight = this.pending.get(channelId);
    if (inflight) return inflight;

    const promise = this.resolveWebhook(channelId);
    this.pending.set(channelId, promise);
    try {
      return await promise;
    } finally {
      this.pending.delete(channelId);
    }
  }

  private async resolveWebhook(channelId: string): Promise<Webhook> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !('fetchWebhooks' in channel)) {
      throw new Error(`Channel ${channelId} not found or doesn't support webhooks`);
    }

    const textChannel = channel as TextChannel;

    // Check for existing bot-owned webhook
    const existing = await textChannel.fetchWebhooks();
    const ours = existing.find(
      wh => wh.owner?.id === this.client.user?.id && wh.name === WEBHOOK_NAME
    );

    if (ours) {
      this.cache.set(channelId, ours);
      return ours;
    }

    // Create new webhook
    const webhook = await textChannel.createWebhook({
      name: WEBHOOK_NAME,
      reason: 'Multi-entity message relay',
    });

    this.cache.set(channelId, webhook);
    logger.info(`Webhook created for channel ${channelId}`);
    return webhook;
  }

  /**
   * Send a message as a specific entity (custom name + avatar).
   */
  async sendAsEntity(
    channelId: string,
    content: string,
    entityName: string,
    entityAvatarUrl?: string | null,
    entityId?: string
  ): Promise<{ messageId: string }> {
    const webhook = await this.getWebhook(channelId);

    const msg = await webhook.send({
      content,
      username: entityName,
      avatarURL: bustAvatarCache(entityAvatarUrl),
      allowedMentions: { parse: ['users'] },
    });

    if (entityId) this.trackSentMessage(msg.id, entityId);
    return { messageId: msg.id };
  }

  /**
   * Send a file attachment as a specific entity (custom name + avatar).
   */
  async sendFileAsEntity(
    channelId: string,
    fileName: string,
    fileData: Buffer,
    entityName: string,
    entityAvatarUrl?: string | null,
    content?: string,
    entityId?: string
  ): Promise<{ messageId: string }> {
    const webhook = await this.getWebhook(channelId);

    const msg = await webhook.send({
      content: content || undefined,
      username: entityName,
      avatarURL: bustAvatarCache(entityAvatarUrl),
      allowedMentions: { parse: ['users'] },
      files: [{ attachment: fileData, name: fileName }],
    });

    if (entityId) this.trackSentMessage(msg.id, entityId);
    return { messageId: msg.id };
  }

  /**
   * Edit a webhook message.
   */
  async editAsEntity(
    channelId: string,
    messageId: string,
    newContent: string
  ): Promise<void> {
    const webhook = await this.getWebhook(channelId);
    await webhook.editMessage(messageId, { content: newContent });
  }

  /**
   * Send an embed as a specific entity (for namecards, introductions, etc).
   */
  async sendEmbedAsEntity(
    channelId: string,
    entityName: string,
    entityAvatarUrl: string | null | undefined,
    embeds: Array<Record<string, unknown>>,
    entityId?: string
  ): Promise<{ messageId: string }> {
    const webhook = await this.getWebhook(channelId);

    const msg = await webhook.send({
      username: entityName,
      avatarURL: bustAvatarCache(entityAvatarUrl),
      embeds,
      allowedMentions: { parse: [] },
    });

    if (entityId) this.trackSentMessage(msg.id, entityId);
    return { messageId: msg.id };
  }

  /**
   * Invalidate cached webhook for a channel.
   */
  invalidateChannel(channelId: string): void {
    this.cache.delete(channelId);
  }
}
