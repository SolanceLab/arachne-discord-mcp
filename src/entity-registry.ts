import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { generateApiKey, generateSalt, hashApiKey, deriveEncryptionKey } from './crypto.js';
import { keyStore } from './key-store.js';
import { logger } from './logger.js';
import type { Entity, EntityServer, ServerRequest, ServerSettings, ServerTemplate, OAuthAuthCode, OAuthAccessToken, OAuthRefreshToken, OAuthClient } from './types.js';

export class EntityRegistry {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        avatar_url    TEXT,
        api_key_hash  TEXT NOT NULL,
        key_salt      TEXT NOT NULL,
        created_at    TEXT DEFAULT (datetime('now')),
        active        INTEGER DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS entity_servers (
        entity_id     TEXT NOT NULL REFERENCES entities(id),
        server_id     TEXT NOT NULL,
        channels      TEXT DEFAULT '[]',
        tools         TEXT DEFAULT '[]',
        PRIMARY KEY (entity_id, server_id)
      );

      CREATE INDEX IF NOT EXISTS idx_entity_servers_server
        ON entity_servers(server_id);
    `);

    // Migrations
    const esCols = this.db.prepare("PRAGMA table_info(entity_servers)").all() as Array<{ name: string }>;
    if (!esCols.some(c => c.name === 'role_id')) {
      this.db.exec("ALTER TABLE entity_servers ADD COLUMN role_id TEXT DEFAULT NULL");
      logger.info('Migration: added role_id column to entity_servers');
    }
    if (!esCols.some(c => c.name === 'announce_channel')) {
      this.db.exec("ALTER TABLE entity_servers ADD COLUMN announce_channel TEXT DEFAULT NULL");
      logger.info('Migration: added announce_channel column to entity_servers');
    }
    if (!esCols.some(c => c.name === 'watch_channels')) {
      this.db.exec("ALTER TABLE entity_servers ADD COLUMN watch_channels TEXT DEFAULT '[]'");
      logger.info('Migration: added watch_channels column to entity_servers');
    }
    if (!esCols.some(c => c.name === 'blocked_channels')) {
      this.db.exec("ALTER TABLE entity_servers ADD COLUMN blocked_channels TEXT DEFAULT '[]'");
      logger.info('Migration: added blocked_channels column to entity_servers');
    }

    const eCols = this.db.prepare("PRAGMA table_info(entities)").all() as Array<{ name: string }>;
    if (!eCols.some(c => c.name === 'owner_id')) {
      this.db.exec("ALTER TABLE entities ADD COLUMN owner_id TEXT DEFAULT NULL");
      logger.info('Migration: added owner_id column to entities');
    }
    if (!eCols.some(c => c.name === 'description')) {
      this.db.exec("ALTER TABLE entities ADD COLUMN description TEXT DEFAULT NULL");
      logger.info('Migration: added description column to entities');
    }
    if (!eCols.some(c => c.name === 'accent_color')) {
      this.db.exec("ALTER TABLE entities ADD COLUMN accent_color TEXT DEFAULT NULL");
      logger.info('Migration: added accent_color column to entities');
    }
    if (!eCols.some(c => c.name === 'platform')) {
      this.db.exec("ALTER TABLE entities ADD COLUMN platform TEXT DEFAULT NULL");
      logger.info('Migration: added platform column to entities');
    }
    if (!eCols.some(c => c.name === 'owner_name')) {
      this.db.exec("ALTER TABLE entities ADD COLUMN owner_name TEXT DEFAULT NULL");
      logger.info('Migration: added owner_name column to entities');
    }

    // Server settings table (per-server admin config)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS server_settings (
        server_id        TEXT PRIMARY KEY,
        announce_channel TEXT,
        announce_message TEXT,
        default_template TEXT
      );
    `);

    // Server requests table (for entity-to-server access flow)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS server_requests (
        id           TEXT PRIMARY KEY,
        entity_id    TEXT NOT NULL REFERENCES entities(id),
        server_id    TEXT NOT NULL,
        status       TEXT NOT NULL DEFAULT 'pending',
        requested_by TEXT NOT NULL,
        reviewed_by  TEXT,
        created_at   TEXT DEFAULT (datetime('now')),
        reviewed_at  TEXT
      );
    `);

    const srCols = this.db.prepare("PRAGMA table_info(server_requests)").all() as Array<{ name: string }>;
    if (!srCols.some(c => c.name === 'requested_by_name')) {
      this.db.exec("ALTER TABLE server_requests ADD COLUMN requested_by_name TEXT DEFAULT NULL");
      logger.info('Migration: added requested_by_name column to server_requests');
    }

    const ssCols = this.db.prepare("PRAGMA table_info(server_settings)").all() as Array<{ name: string }>;
    if (!ssCols.some(c => c.name === 'announce_message')) {
      this.db.exec("ALTER TABLE server_settings ADD COLUMN announce_message TEXT DEFAULT NULL");
      logger.info('Migration: added announce_message column to server_settings');
    }

    // Server templates table (custom role templates per server)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS server_templates (
        id         TEXT PRIMARY KEY,
        server_id  TEXT NOT NULL,
        name       TEXT NOT NULL,
        channels   TEXT DEFAULT '[]',
        tools      TEXT DEFAULT '[]',
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_server_templates_server
        ON server_templates(server_id);
    `);

    // OAuth 2.1 tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS oauth_auth_codes (
        code              TEXT PRIMARY KEY,
        entity_id         TEXT NOT NULL REFERENCES entities(id),
        discord_user_id   TEXT NOT NULL,
        client_id         TEXT NOT NULL,
        code_challenge    TEXT NOT NULL,
        code_challenge_method TEXT NOT NULL DEFAULT 'S256',
        redirect_uri      TEXT NOT NULL,
        scope             TEXT NOT NULL DEFAULT 'mcp',
        created_at        TEXT DEFAULT (datetime('now')),
        expires_at        TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS oauth_access_tokens (
        jti               TEXT PRIMARY KEY,
        entity_id         TEXT NOT NULL REFERENCES entities(id),
        discord_user_id   TEXT NOT NULL,
        client_id         TEXT NOT NULL,
        scope             TEXT NOT NULL DEFAULT 'mcp',
        issued_at         TEXT DEFAULT (datetime('now')),
        expires_at        TEXT NOT NULL,
        revoked           INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS oauth_clients (
        client_id                  TEXT PRIMARY KEY,
        client_name                TEXT,
        redirect_uris              TEXT NOT NULL DEFAULT '[]',
        grant_types                TEXT NOT NULL DEFAULT '["authorization_code"]',
        response_types             TEXT NOT NULL DEFAULT '["code"]',
        token_endpoint_auth_method TEXT NOT NULL DEFAULT 'none',
        created_at                 TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
        token             TEXT PRIMARY KEY,
        entity_id         TEXT NOT NULL REFERENCES entities(id),
        discord_user_id   TEXT NOT NULL,
        client_id         TEXT NOT NULL,
        access_token_jti  TEXT NOT NULL,
        created_at        TEXT DEFAULT (datetime('now')),
        expires_at        TEXT NOT NULL,
        revoked           INTEGER DEFAULT 0
      );
    `);

    logger.info('Entity registry initialized');
  }

  /**
   * Create a new entity. Returns the entity and the raw API key (shown once).
   */
  async createEntity(name: string, avatarUrl?: string): Promise<{ entity: Entity; apiKey: string }> {
    const id = uuidv4();
    const apiKey = generateApiKey();
    const salt = generateSalt();
    const hash = await hashApiKey(apiKey);

    this.db.prepare(`
      INSERT INTO entities (id, name, avatar_url, api_key_hash, key_salt)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, avatarUrl ?? null, hash, salt);

    // Cache encryption key in volatile store (available immediately for message encryption)
    const encKey = deriveEncryptionKey(apiKey, salt);
    keyStore.set(id, encKey);

    const entity = this.getEntity(id)!;
    logger.info(`Entity created: ${name} (${id})`);
    return { entity, apiKey };
  }

  /**
   * Get an entity by ID.
   */
  getEntity(id: string): Entity | null {
    return this.db.prepare('SELECT * FROM entities WHERE id = ?').get(id) as Entity | null;
  }

  /**
   * Get all active entities.
   */
  listEntities(): Entity[] {
    return this.db.prepare('SELECT * FROM entities WHERE active = 1 ORDER BY created_at DESC').all() as Entity[];
  }

  /**
   * Deactivate an entity (soft delete).
   */
  deactivateEntity(id: string): boolean {
    const result = this.db.prepare('UPDATE entities SET active = 0 WHERE id = ?').run(id);
    if (result.changes > 0) {
      keyStore.delete(id);
      logger.info(`Entity deactivated: ${id}`);
      return true;
    }
    return false;
  }

  /**
   * Regenerate an entity's API key. Returns the new raw key.
   */
  async regenerateKey(id: string): Promise<string | null> {
    const entity = this.getEntity(id);
    if (!entity) return null;

    const apiKey = generateApiKey();
    const salt = generateSalt();
    const hash = await hashApiKey(apiKey);

    this.db.prepare(`
      UPDATE entities SET api_key_hash = ?, key_salt = ? WHERE id = ?
    `).run(hash, salt, id);

    // Update encryption key in volatile store
    const encKey = deriveEncryptionKey(apiKey, salt);
    keyStore.set(id, encKey);

    logger.info(`API key regenerated for entity: ${id}`);
    return apiKey;
  }

  /**
   * Add an entity to a server with optional channel restrictions.
   */
  addServer(entityId: string, serverId: string, channels: string[] = [], tools: string[] = []): boolean {
    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO entity_servers (entity_id, server_id, channels, tools)
        VALUES (?, ?, ?, ?)
      `).run(entityId, serverId, JSON.stringify(channels), JSON.stringify(tools));
      logger.info(`Entity ${entityId} added to server ${serverId}`);
      return true;
    } catch (err) {
      logger.error(`Failed to add server: ${err}`);
      return false;
    }
  }

  /**
   * Remove an entity from a server. Returns the role_id if one existed (for cleanup).
   */
  removeServer(entityId: string, serverId: string): { removed: boolean; roleId: string | null } {
    const existing = this.db.prepare(
      'SELECT role_id FROM entity_servers WHERE entity_id = ? AND server_id = ?'
    ).get(entityId, serverId) as { role_id: string | null } | undefined;

    const result = this.db.prepare(`
      DELETE FROM entity_servers WHERE entity_id = ? AND server_id = ?
    `).run(entityId, serverId);
    return { removed: result.changes > 0, roleId: existing?.role_id ?? null };
  }

  /**
   * Update the role_id for an entity-server pair.
   */
  updateServerRoleId(entityId: string, serverId: string, roleId: string): void {
    this.db.prepare(
      'UPDATE entity_servers SET role_id = ? WHERE entity_id = ? AND server_id = ?'
    ).run(roleId, entityId, serverId);
  }

  /**
   * Get a map of role_id → entity_id for a given server (for mention routing).
   */
  getRoleEntityMap(serverId: string): Map<string, string> {
    const rows = this.db.prepare(`
      SELECT es.entity_id, es.role_id
      FROM entity_servers es
      JOIN entities e ON e.id = es.entity_id
      WHERE es.server_id = ? AND es.role_id IS NOT NULL AND e.active = 1
    `).all(serverId) as Array<{ entity_id: string; role_id: string }>;

    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.role_id, row.entity_id);
    }
    return map;
  }

  /**
   * Get all server configs for an entity.
   */
  getEntityServers(entityId: string): EntityServer[] {
    return this.db.prepare(
      'SELECT * FROM entity_servers WHERE entity_id = ?'
    ).all(entityId) as EntityServer[];
  }

  /**
   * HOT PATH — called on every incoming message.
   * Find all active entities subscribed to a given server+channel.
   */
  getEntitiesForChannel(serverId: string, channelId: string): Array<Entity & { channels: string; tools: string }> {
    const rows = this.db.prepare(`
      SELECT e.*, es.channels, es.tools
      FROM entities e
      JOIN entity_servers es ON e.id = es.entity_id
      WHERE e.active = 1 AND es.server_id = ?
    `).all(serverId) as Array<Entity & { channels: string; tools: string }>;

    // Filter: entity sees this channel if channels array is empty (all) or includes channelId
    return rows.filter(row => {
      const channels: string[] = JSON.parse(row.channels);
      return channels.length === 0 || channels.includes(channelId);
    });
  }

  // --- Dashboard methods ---

  /**
   * Get all entities owned by a Discord user.
   */
  getEntitiesByOwner(ownerId: string): Entity[] {
    return this.db.prepare(
      'SELECT * FROM entities WHERE owner_id = ? AND active = 1 ORDER BY created_at DESC'
    ).all(ownerId) as Entity[];
  }

  /**
   * Set or change the owner of an entity.
   */
  setEntityOwner(entityId: string, ownerId: string | null, ownerName?: string | null): boolean {
    const result = this.db.prepare(
      'UPDATE entities SET owner_id = ?, owner_name = ? WHERE id = ?'
    ).run(ownerId, ownerName ?? null, entityId);
    return result.changes > 0;
  }

  /**
   * Update entity identity (name and/or avatar).
   */
  updateEntityIdentity(entityId: string, fields: {
    name?: string;
    avatarUrl?: string | null;
    description?: string | null;
    accentColor?: string | null;
    platform?: string | null;
  }): boolean {
    const entity = this.getEntity(entityId);
    if (!entity) return false;

    this.db.prepare(
      'UPDATE entities SET name = ?, avatar_url = ?, description = ?, accent_color = ?, platform = ? WHERE id = ?'
    ).run(
      fields.name ?? entity.name,
      fields.avatarUrl !== undefined ? fields.avatarUrl : entity.avatar_url,
      fields.description !== undefined ? fields.description : entity.description,
      fields.accentColor !== undefined ? fields.accentColor : entity.accent_color,
      fields.platform !== undefined ? fields.platform : entity.platform,
      entityId,
    );
    return true;
  }

  /**
   * Get all entities on a specific server (with owner info).
   */
  getEntitiesForServer(serverId: string): Array<Entity & { channels: string; tools: string; watch_channels: string; blocked_channels: string; role_id: string | null }> {
    return this.db.prepare(`
      SELECT e.*, es.channels, es.tools, es.watch_channels, es.blocked_channels, es.role_id
      FROM entities e
      JOIN entity_servers es ON e.id = es.entity_id
      WHERE es.server_id = ? AND e.active = 1
    `).all(serverId) as Array<Entity & { channels: string; tools: string; watch_channels: string; blocked_channels: string; role_id: string | null }>;
  }

  /**
   * Create a server access request.
   */
  createServerRequest(entityId: string, serverId: string, requestedBy: string, requestedByName?: string): ServerRequest {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO server_requests (id, entity_id, server_id, requested_by, requested_by_name)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, entityId, serverId, requestedBy, requestedByName ?? null);
    return this.db.prepare('SELECT * FROM server_requests WHERE id = ?').get(id) as ServerRequest;
  }

  /**
   * Get server requests by server and status.
   */
  getServerRequests(serverId: string, status?: string): ServerRequest[] {
    if (status) {
      return this.db.prepare(
        'SELECT * FROM server_requests WHERE server_id = ? AND status = ? ORDER BY created_at DESC'
      ).all(serverId, status) as ServerRequest[];
    }
    return this.db.prepare(
      'SELECT * FROM server_requests WHERE server_id = ? ORDER BY created_at DESC'
    ).all(serverId) as ServerRequest[];
  }

  /**
   * Update a server request status.
   */
  updateServerRequest(requestId: string, status: string, reviewedBy: string): boolean {
    const result = this.db.prepare(`
      UPDATE server_requests SET status = ?, reviewed_by = ?, reviewed_at = datetime('now')
      WHERE id = ?
    `).run(status, reviewedBy, requestId);
    return result.changes > 0;
  }

  /**
   * Get a single server request by ID.
   */
  getServerRequest(requestId: string): ServerRequest | null {
    return this.db.prepare('SELECT * FROM server_requests WHERE id = ?').get(requestId) as ServerRequest | null;
  }

  /**
   * Update entity-server config (channels, tools).
   */
  updateEntityServerConfig(entityId: string, serverId: string, channels?: string[], tools?: string[]): boolean {
    const existing = this.db.prepare(
      'SELECT * FROM entity_servers WHERE entity_id = ? AND server_id = ?'
    ).get(entityId, serverId) as EntityServer | undefined;
    if (!existing) return false;

    this.db.prepare(`
      UPDATE entity_servers SET channels = ?, tools = ?
      WHERE entity_id = ? AND server_id = ?
    `).run(
      channels !== undefined ? JSON.stringify(channels) : existing.channels,
      tools !== undefined ? JSON.stringify(tools) : existing.tools,
      entityId, serverId
    );
    return true;
  }

  /**
   * Update entity-server owner config (watch_channels, blocked_channels).
   */
  updateEntityServerOwnerConfig(entityId: string, serverId: string, watchChannels?: string[], blockedChannels?: string[]): boolean {
    const existing = this.db.prepare(
      'SELECT * FROM entity_servers WHERE entity_id = ? AND server_id = ?'
    ).get(entityId, serverId) as EntityServer | undefined;
    if (!existing) return false;

    this.db.prepare(`
      UPDATE entity_servers SET watch_channels = ?, blocked_channels = ?
      WHERE entity_id = ? AND server_id = ?
    `).run(
      watchChannels !== undefined ? JSON.stringify(watchChannels) : existing.watch_channels,
      blockedChannels !== undefined ? JSON.stringify(blockedChannels) : existing.blocked_channels,
      entityId, serverId
    );
    return true;
  }

  // --- Server Settings ---

  /**
   * Get server-level settings (announcement channel, default template, etc.).
   */
  getServerSettings(serverId: string): ServerSettings {
    const row = this.db.prepare('SELECT * FROM server_settings WHERE server_id = ?').get(serverId) as ServerSettings | undefined;
    return row || { server_id: serverId, announce_channel: null, announce_message: null, default_template: null };
  }

  /**
   * Update server-level settings (upsert).
   */
  updateServerSettings(serverId: string, settings: { announce_channel?: string | null; announce_message?: string | null; default_template?: string | null }): ServerSettings {
    const existing = this.getServerSettings(serverId);
    this.db.prepare(`
      INSERT INTO server_settings (server_id, announce_channel, announce_message, default_template)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(server_id) DO UPDATE SET
        announce_channel = excluded.announce_channel,
        announce_message = excluded.announce_message,
        default_template = excluded.default_template
    `).run(
      serverId,
      settings.announce_channel !== undefined ? settings.announce_channel : existing.announce_channel,
      settings.announce_message !== undefined ? settings.announce_message : existing.announce_message,
      settings.default_template !== undefined ? settings.default_template : existing.default_template,
    );
    return this.getServerSettings(serverId);
  }

  // --- Server Templates ---

  getServerTemplates(serverId: string): ServerTemplate[] {
    return this.db.prepare(
      'SELECT * FROM server_templates WHERE server_id = ? ORDER BY created_at DESC'
    ).all(serverId) as ServerTemplate[];
  }

  getServerTemplate(templateId: string): ServerTemplate | null {
    return this.db.prepare('SELECT * FROM server_templates WHERE id = ?').get(templateId) as ServerTemplate | null;
  }

  createServerTemplate(serverId: string, name: string, channels: string[], tools: string[]): ServerTemplate {
    const id = uuidv4();
    this.db.prepare(`
      INSERT INTO server_templates (id, server_id, name, channels, tools)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, serverId, name, JSON.stringify(channels), JSON.stringify(tools));
    return this.getServerTemplate(id)!;
  }

  updateServerTemplate(templateId: string, fields: { name?: string; channels?: string[]; tools?: string[] }): ServerTemplate | null {
    const existing = this.getServerTemplate(templateId);
    if (!existing) return null;
    this.db.prepare(`
      UPDATE server_templates SET name = ?, channels = ?, tools = ? WHERE id = ?
    `).run(
      fields.name ?? existing.name,
      fields.channels ? JSON.stringify(fields.channels) : existing.channels,
      fields.tools ? JSON.stringify(fields.tools) : existing.tools,
      templateId
    );
    return this.getServerTemplate(templateId)!;
  }

  deleteServerTemplate(templateId: string): boolean {
    const result = this.db.prepare('DELETE FROM server_templates WHERE id = ?').run(templateId);
    return result.changes > 0;
  }

  /**
   * Hard delete an entity and all its server associations.
   */
  deleteEntity(entityId: string): boolean {
    this.db.prepare('DELETE FROM entity_servers WHERE entity_id = ?').run(entityId);
    this.db.prepare('DELETE FROM server_requests WHERE entity_id = ?').run(entityId);
    keyStore.delete(entityId);
    const result = this.db.prepare('DELETE FROM entities WHERE id = ?').run(entityId);
    return result.changes > 0;
  }

  // --- OAuth 2.1 ---

  createAuthCode(
    entityId: string, discordUserId: string, clientId: string,
    codeChallenge: string, redirectUri: string, scope: string = 'mcp'
  ): OAuthAuthCode {
    const code = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min
    this.db.prepare(`
      INSERT INTO oauth_auth_codes (code, entity_id, discord_user_id, client_id, code_challenge, code_challenge_method, redirect_uri, scope, expires_at)
      VALUES (?, ?, ?, ?, ?, 'S256', ?, ?, ?)
    `).run(code, entityId, discordUserId, clientId, codeChallenge, redirectUri, scope, expiresAt);
    return this.db.prepare('SELECT * FROM oauth_auth_codes WHERE code = ?').get(code) as OAuthAuthCode;
  }

  consumeAuthCode(code: string): OAuthAuthCode | null {
    const row = this.db.prepare('SELECT * FROM oauth_auth_codes WHERE code = ?').get(code) as OAuthAuthCode | null;
    if (!row) return null;
    this.db.prepare('DELETE FROM oauth_auth_codes WHERE code = ?').run(code);
    if (new Date(row.expires_at) < new Date()) return null;
    return row;
  }

  createAccessToken(jti: string, entityId: string, discordUserId: string, clientId: string, scope: string, expiresAt: string): void {
    this.db.prepare(`
      INSERT INTO oauth_access_tokens (jti, entity_id, discord_user_id, client_id, scope, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(jti, entityId, discordUserId, clientId, scope, expiresAt);
  }

  isAccessTokenRevoked(jti: string): boolean {
    const row = this.db.prepare('SELECT revoked FROM oauth_access_tokens WHERE jti = ?').get(jti) as { revoked: number } | null;
    return row?.revoked === 1;
  }

  revokeAccessToken(jti: string): void {
    this.db.prepare('UPDATE oauth_access_tokens SET revoked = 1 WHERE jti = ?').run(jti);
  }

  createRefreshToken(entityId: string, discordUserId: string, clientId: string, accessTokenJti: string): OAuthRefreshToken {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
    this.db.prepare(`
      INSERT INTO oauth_refresh_tokens (token, entity_id, discord_user_id, client_id, access_token_jti, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(token, entityId, discordUserId, clientId, accessTokenJti, expiresAt);
    return this.db.prepare('SELECT * FROM oauth_refresh_tokens WHERE token = ?').get(token) as OAuthRefreshToken;
  }

  registerOAuthClient(
    clientName: string | null,
    redirectUris: string[],
    grantTypes: string[] = ['authorization_code'],
    responseTypes: string[] = ['code'],
    tokenEndpointAuthMethod: string = 'none',
  ): OAuthClient {
    const clientId = uuidv4();
    this.db.prepare(`
      INSERT INTO oauth_clients (client_id, client_name, redirect_uris, grant_types, response_types, token_endpoint_auth_method)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(clientId, clientName, JSON.stringify(redirectUris), JSON.stringify(grantTypes), JSON.stringify(responseTypes), tokenEndpointAuthMethod);
    return this.db.prepare('SELECT * FROM oauth_clients WHERE client_id = ?').get(clientId) as OAuthClient;
  }

  getOAuthClient(clientId: string): OAuthClient | null {
    return this.db.prepare('SELECT * FROM oauth_clients WHERE client_id = ?').get(clientId) as OAuthClient | null;
  }

  consumeRefreshToken(token: string): OAuthRefreshToken | null {
    const row = this.db.prepare('SELECT * FROM oauth_refresh_tokens WHERE token = ?').get(token) as OAuthRefreshToken | null;
    if (!row || row.revoked === 1) return null;
    this.db.prepare('DELETE FROM oauth_refresh_tokens WHERE token = ?').run(token);
    if (new Date(row.expires_at) < new Date()) return null;
    return row;
  }

  close() {
    this.db.close();
  }
}
