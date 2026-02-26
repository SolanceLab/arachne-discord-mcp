import { Client, type Webhook, type TextChannel } from 'discord.js';
import { logger } from './logger.js';

const WEBHOOK_NAME = 'Arachne';

export class WebhookManager {
  private cache: Map<string, Webhook> = new Map();
  private pending: Map<string, Promise<Webhook>> = new Map();
  private client: Client;

  constructor(client: Client) {
    this.client = client;
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
    entityAvatarUrl?: string | null
  ): Promise<{ messageId: string }> {
    const webhook = await this.getWebhook(channelId);

    const msg = await webhook.send({
      content,
      username: entityName,
      avatarURL: entityAvatarUrl || undefined,
      allowedMentions: { parse: ['users'] },
    });

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
    content?: string
  ): Promise<{ messageId: string }> {
    const webhook = await this.getWebhook(channelId);

    const msg = await webhook.send({
      content: content || undefined,
      username: entityName,
      avatarURL: entityAvatarUrl || undefined,
      allowedMentions: { parse: ['users'] },
      files: [{ attachment: fileData, name: fileName }],
    });

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
    embeds: Array<Record<string, unknown>>
  ): Promise<{ messageId: string }> {
    const webhook = await this.getWebhook(channelId);

    const msg = await webhook.send({
      username: entityName,
      avatarURL: entityAvatarUrl || undefined,
      embeds,
      allowedMentions: { parse: [] },
    });

    return { messageId: msg.id };
  }

  /**
   * Invalidate cached webhook for a channel.
   */
  invalidateChannel(channelId: string): void {
    this.cache.delete(channelId);
  }
}
