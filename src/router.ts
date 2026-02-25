import { logger } from './logger.js';
import { keyStore } from './key-store.js';
import type { EntityRegistry } from './entity-registry.js';
import type { Gateway } from './gateway.js';
import type { MessageBus } from './message-bus.js';
import type { NormalizedMessage } from './types.js';

export class Router {
  private registry: EntityRegistry;
  private bus: MessageBus;
  private gateway: Gateway;

  constructor(gateway: Gateway, registry: EntityRegistry, bus: MessageBus) {
    this.gateway = gateway;
    this.registry = registry;
    this.bus = bus;

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

    // Push to each entity's queue (encrypted if key is available)
    for (const entity of entities) {
      const encKey = keyStore.get(entity.id);
      this.bus.push(entity.id, {
        messageId: msg.messageId,
        channelId: msg.channelId,
        serverId: msg.serverId,
        authorId: msg.authorId,
        authorName: msg.authorName,
        content: msg.content,
        timestamp: msg.timestamp,
        addressed: addressedEntityIds.has(entity.id),
      }, encKey);
    }

    logger.debug(
      `Routed message ${msg.messageId} to ${entities.length} entity(s) in #${msg.channelId}`
    );
  }
}
