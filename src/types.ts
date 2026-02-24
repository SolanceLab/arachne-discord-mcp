import type { Client, Webhook } from 'discord.js';
import type { EntityRegistry } from './entity-registry.js';
import type { MessageBus } from './message-bus.js';
import type { WebhookManager } from './webhook-manager.js';

// --- Entity Registry ---

export interface Entity {
  id: string;
  name: string;
  avatar_url: string | null;
  api_key_hash: string;
  key_salt: string;
  created_at: string;
  active: number;
}

export interface EntityServer {
  entity_id: string;
  server_id: string;
  channels: string; // JSON array of channel IDs (empty array = all)
  tools: string;    // JSON array of allowed tool names (empty array = all)
}

export interface EntityWithServers extends Entity {
  servers: EntityServer[];
}

// --- Message Bus ---

export interface QueuedMessage {
  messageId: string;
  channelId: string;
  serverId: string;
  authorId: string;
  authorName: string;
  content: string;
  timestamp: Date;
  expiresAt: Date;
}

export interface ReadableMessage {
  id: string;
  channel_id: string;
  server_id: string;
  author_id: string;
  author_name: string;
  content: string;
  timestamp: string; // ISO string
}

// --- Discord Gateway ---

export interface NormalizedMessage {
  messageId: string;
  channelId: string;
  serverId: string;
  authorId: string;
  authorName: string;
  authorIsBot: boolean;
  webhookId: string | null;
  content: string;
  timestamp: Date;
}

// --- MCP Context ---

export interface EntityContext {
  entity: Entity;
  entityServers: EntityServer[];
  registry: EntityRegistry;
  bus: MessageBus;
  webhookManager: WebhookManager;
  discordClient: Client;
}
