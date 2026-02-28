import { Client, Events, GatewayIntentBits } from 'discord.js';
import { EventEmitter } from 'node:events';
import { logger } from './logger.js';
import type { NormalizedMessage } from './types.js';

export class Gateway extends EventEmitter {
  private client: Client;
  private processedMessages: Set<string> = new Set();
  private _botUserId: string | null = null;

  constructor() {
    super();
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
    });

    this.client.on(Events.ClientReady, (c) => {
      this._botUserId = c.user.id;
      logger.info(`Discord gateway connected as ${c.user.tag} (${c.user.id})`);
      logger.info(`Serving ${c.guilds.cache.size} server(s)`);
      this.emit('ready');
    });

    this.client.on(Events.MessageCreate, (message) => {
      // Skip DMs for Phase 1
      if (!message.guild) return;

      // Deduplication
      if (this.processedMessages.has(message.id)) return;
      this.processedMessages.add(message.id);
      if (this.processedMessages.size > 100) {
        const first = this.processedMessages.values().next().value;
        if (first) this.processedMessages.delete(first);
      }

      const normalized: NormalizedMessage = {
        messageId: message.id,
        channelId: message.channelId,
        serverId: message.guild.id,
        authorId: message.author.id,
        authorName: message.member?.displayName || message.author.displayName || message.author.username,
        authorIsBot: message.author.bot,
        webhookId: message.webhookId,
        content: message.content,
        timestamp: message.createdAt,
        mentionedRoleIds: message.mentions.roles.map(r => r.id),
        replyToMessageId: message.reference?.messageId ?? null,
      };

      this.emit('message', normalized);
    });

    this.client.on(Events.GuildCreate, (guild) => {
      logger.info(`Joined server: ${guild.name} (${guild.id})`);
      this.emit('guildCreate', guild);
    });

    this.client.on(Events.Error, (error) => {
      logger.error(`Discord error: ${error.message}`);
    });

    this.client.on(Events.ShardDisconnect, () => {
      logger.warn('Discord shard disconnected');
    });

    this.client.on(Events.ShardReconnecting, () => {
      logger.info('Discord shard reconnecting...');
    });
  }

  async login(token: string): Promise<void> {
    await this.client.login(token);
  }

  get discordClient(): Client {
    return this.client;
  }

  get botUserId(): string | null {
    return this._botUserId;
  }

  get isReady(): boolean {
    return this.client.isReady();
  }

  async destroy(): Promise<void> {
    this.client.destroy();
    logger.info('Discord gateway destroyed');
  }
}
