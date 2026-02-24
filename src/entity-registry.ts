import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { generateApiKey, generateSalt, hashApiKey } from './crypto.js';
import { logger } from './logger.js';
import type { Entity, EntityServer } from './types.js';

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
   * Remove an entity from a server.
   */
  removeServer(entityId: string, serverId: string): boolean {
    const result = this.db.prepare(`
      DELETE FROM entity_servers WHERE entity_id = ? AND server_id = ?
    `).run(entityId, serverId);
    return result.changes > 0;
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

  close() {
    this.db.close();
  }
}
