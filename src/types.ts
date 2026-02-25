import type { Client, Webhook } from 'discord.js';
import type { EntityRegistry } from './entity-registry.js';
import type { MessageBus } from './message-bus.js';
import type { WebhookManager } from './webhook-manager.js';

// --- Entity Registry ---

export interface Entity {
  id: string;
  name: string;
  description: string | null;
  avatar_url: string | null;
  accent_color: string | null; // Hex color for profile banner
  platform: string | null;     // 'claude' | 'gpt' | 'gemini' | 'other'
  owner_name: string | null;   // Discord display name of owner
  api_key_hash: string;
  key_salt: string;
  created_at: string;
  active: number;
  owner_id: string | null; // Discord user ID of entity owner
}

export interface EntityServer {
  entity_id: string;
  server_id: string;
  channels: string;          // JSON array: admin whitelist of channel IDs (empty = all)
  tools: string;             // JSON array: admin whitelist of MCP tools (empty = all)
  watch_channels: string;    // JSON array: entity owner's active-monitoring channels
  blocked_channels: string;  // JSON array: entity owner's no-respond channels
  role_id: string | null;    // Discord role ID for @mentions
  announce_channel: string | null; // Channel for join announcements
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
  addressed: boolean;  // true when this entity was @mentioned by role
  encrypted: boolean;  // true when content is AES-256-GCM encrypted blob (base64)
}

export interface ReadableMessage {
  id: string;
  channel_id: string;
  server_id: string;
  author_id: string;
  author_name: string;
  content: string;
  timestamp: string; // ISO string
  addressed: boolean;
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
  mentionedRoleIds: string[];
}

// --- MCP Context ---

export interface EntityContext {
  entity: Entity;
  entityServers: EntityServer[];
  registry: EntityRegistry;
  bus: MessageBus;
  webhookManager: WebhookManager;
  discordClient: Client;
  encryptionKey?: Buffer; // Per-entity AES-256 key (volatile, from KeyStore)
}

// --- Dashboard / Loom ---

export interface ServerRequest {
  id: string;
  entity_id: string;
  server_id: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_by: string;
  requested_by_name: string | null;
  reviewed_by: string | null;
  created_at: string;
  reviewed_at: string | null;
}

export interface ServerSettings {
  server_id: string;
  announce_channel: string | null;
  announce_message: string | null; // custom template with {name}, {mention}, {platform}, {owner} placeholders
  default_template: string | null; // template ID or null
}

export interface ServerTemplate {
  id: string;
  server_id: string;
  name: string;
  channels: string;  // JSON array of channel IDs (empty = all)
  tools: string;     // JSON array of tool names (empty = all)
  created_at: string;
}

export interface JWTPayload {
  sub: string;           // Discord user ID
  username: string;
  avatar: string | null;
  is_operator: boolean;
  admin_guilds: string[]; // Guild IDs where user is admin + bot is present
  member_guilds: string[]; // Guild IDs where user is member + bot is present
  iat: number;
  exp: number;
}

// --- OAuth 2.1 ---

export interface OAuthAuthCode {
  code: string;
  entity_id: string;
  discord_user_id: string;
  client_id: string;
  code_challenge: string;
  code_challenge_method: string;
  redirect_uri: string;
  scope: string;
  created_at: string;
  expires_at: string;
}

export interface OAuthAccessToken {
  jti: string;
  entity_id: string;
  discord_user_id: string;
  client_id: string;
  scope: string;
  issued_at: string;
  expires_at: string;
  revoked: number;
}

export interface OAuthRefreshToken {
  token: string;
  entity_id: string;
  discord_user_id: string;
  client_id: string;
  access_token_jti: string;
  created_at: string;
  expires_at: string;
  revoked: number;
}

export interface OAuthClient {
  client_id: string;
  client_name: string | null;
  redirect_uris: string;        // JSON array
  grant_types: string;           // JSON array
  response_types: string;        // JSON array
  token_endpoint_auth_method: string;
  created_at: string;
}

export interface OAuthJWTPayload {
  iss: string;       // "https://arachne-discord.fly.dev"
  sub: string;       // Discord user ID
  aud: string;       // "https://arachne-discord.fly.dev/mcp/{entity_id}"
  exp: number;
  iat: number;
  jti: string;
  scope: string;     // "mcp"
  entity_id: string;
  client_id: string;
}
