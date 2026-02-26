import { logger } from './logger.js';
import { keyStore } from './key-store.js';
import type { EntityRegistry } from './entity-registry.js';
import type { Gateway } from './gateway.js';
import type { MessageBus } from './message-bus.js';
import type { Entity, NormalizedMessage } from './types.js';
import type { Client } from 'discord.js';

export class Router {
  private registry: EntityRegistry;
  private bus: MessageBus;
  private gateway: Gateway;
  private discordClient: Client;

  constructor(gateway: Gateway, registry: EntityRegistry, bus: MessageBus, discordClient: Client) {
    this.gateway = gateway;
    this.registry = registry;
    this.bus = bus;
    this.discordClient = discordClient;

    this.gateway.on('message', (msg: NormalizedMessage) => this.handleMessage(msg));
    logger.info('Router attached to gateway');
  }

  private handleMessage(msg: NormalizedMessage): void {
    // Skip messages from bots (including ourselves)
    if (msg.authorIsBot) return;

    // Skip webhook messages (prevents echo loops when entities post)
    if (msg.webhookId) return;

    // Skip empty content
    if (!msg.content) return;

    // Find all entities subscribed to this server+channel
    const entities = this.registry.getEntitiesForChannel(msg.serverId, msg.channelId);

    if (entities.length === 0) return;

    // Build role → entity map for mention detection
    const roleEntityMap = msg.mentionedRoleIds.length > 0
      ? this.registry.getRoleEntityMap(msg.serverId)
      : new Map<string, string>();

    // Set of entity IDs that were @mentioned by role
    const addressedEntityIds = new Set<string>();
    for (const roleId of msg.mentionedRoleIds) {
      const entityId = roleEntityMap.get(roleId);
      if (entityId) addressedEntityIds.add(entityId);
    }

    const contentLower = msg.content.toLowerCase();

    // Push to each entity's queue (encrypted if key is available)
    for (const entity of entities) {
      // Hard filter: skip if channel is blocked for this entity (overrides everything)
      const blockedChannels: string[] = JSON.parse(entity.blocked_channels || '[]');
      if (blockedChannels.includes(msg.channelId)) continue;

      // Trigger word + mention detection (runs before watch filter — triggers punch through)
      const triggers: string[] = JSON.parse(entity.triggers || '[]');
      const triggered = triggers.length > 0 && triggers.some(t => contentLower.includes(t.toLowerCase()));
      const addressed = addressedEntityIds.has(entity.id);

      // Watch channel filter: if watch_channels is set, only queue from those channels
      // BUT triggered/addressed messages always get through
      const watchChannels: string[] = JSON.parse(entity.watch_channels || '[]');
      if (watchChannels.length > 0 && !watchChannels.includes(msg.channelId) && !triggered && !addressed) continue;

      const guild = this.discordClient.guilds.cache.get(msg.serverId);
      const ch = guild?.channels.cache.get(msg.channelId);
      const resolvedChannelName = ch && 'name' in ch ? ch.name : msg.channelId;

      const encKey = keyStore.get(entity.id);
      this.bus.push(entity.id, {
        messageId: msg.messageId,
        channelId: msg.channelId,
        channelName: resolvedChannelName,
        serverId: msg.serverId,
        authorId: msg.authorId,
        authorName: msg.authorName,
        content: msg.content,
        timestamp: msg.timestamp,
        addressed,
        triggered,
      }, encKey);

      // Owner notifications (fire-and-forget)
      if (addressed && entity.notify_on_mention && entity.owner_id) {
        this.sendOwnerNotification(entity, msg, 'mention');
      }
      if (triggered && entity.notify_on_trigger && entity.owner_id) {
        this.sendOwnerNotification(entity, msg, 'trigger');
      }
    }

    logger.debug(
      `Routed message ${msg.messageId} to ${entities.length} entity(s) in #${msg.channelId}`
    );
  }

  private async sendOwnerNotification(
    entity: Entity,
    msg: NormalizedMessage,
    reason: 'mention' | 'trigger',
  ): Promise<void> {
    try {
      const owner = await this.discordClient.users.fetch(entity.owner_id!);

      // Resolve server and channel names for readability
      const guild = this.discordClient.guilds.cache.get(msg.serverId);
      const serverName = guild?.name ?? msg.serverId;
      const channel = guild?.channels.cache.get(msg.channelId);
      const channelName = channel && 'name' in channel ? `#${channel.name}` : `#${msg.channelId}`;

      const preview = msg.content.length > 200 ? msg.content.slice(0, 200) + '...' : msg.content;
      const jumpLink = `https://discord.com/channels/${msg.serverId}/${msg.channelId}/${msg.messageId}`;

      const label = reason === 'mention' ? '@mentioned' : 'triggered';

      const dmContent = [
        `**${entity.name}** was ${label} in **${serverName}** → ${channelName}`,
        `> **${msg.authorName}:** ${preview}`,
        `[Jump to message](${jumpLink})`,
      ].join('\n');

      await owner.send(dmContent);
      logger.info(`Notification sent to ${entity.owner_id} (${reason}) for entity ${entity.name}`);
    } catch (err) {
      logger.warn(`Failed to send ${reason} notification for entity ${entity.name}: ${err}`);
    }
  }
}
