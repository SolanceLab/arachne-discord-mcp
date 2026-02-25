import { Router } from 'express';
import type { Request, Response } from 'express';
import type { Client } from 'discord.js';
import { requireAuth, requireOperator } from './middleware.js';
import { createEntityRole, deleteEntityRole, sendAnnouncement } from './discord-api.js';
import type { EntityRegistry } from '../entity-registry.js';
import { logger } from '../logger.js';

export function createOperatorRouter(registry: EntityRegistry, discordClient: Client): Router {
  const router = Router();

  router.use(requireAuth, requireOperator);

  // GET /api/operator/entities — all entities with owners and servers
  router.get('/entities', (_req: Request, res: Response) => {
    const entities = registry.listEntities();
    const result = entities.map(e => ({
      id: e.id,
      name: e.name,
      avatar_url: e.avatar_url,
      owner_id: e.owner_id,
      created_at: e.created_at,
      active: e.active,
      servers: registry.getEntityServers(e.id).map(s => ({
        server_id: s.server_id,
        channels: JSON.parse(s.channels),
        tools: JSON.parse(s.tools),
        role_id: s.role_id,
      })),
    }));
    res.json(result);
  });

  // POST /api/operator/entities — create entity
  router.post('/entities', async (req: Request, res: Response) => {
    const { name, avatar_url, owner_id } = req.body;
    if (!name) {
      res.status(400).json({ error: 'name required' });
      return;
    }
    const { entity, apiKey } = await registry.createEntity(name, avatar_url);
    if (owner_id) {
      registry.setEntityOwner(entity.id, owner_id);
    }
    res.json({
      id: entity.id,
      name: entity.name,
      avatar_url: entity.avatar_url,
      owner_id: owner_id || null,
      api_key: apiKey,
      mcp_url: `/mcp/${entity.id}`,
    });
  });

  // DELETE /api/operator/entities/:id — hard delete entity
  router.delete('/entities/:id', async (req: Request, res: Response) => {
    // First clean up Discord roles
    const servers = registry.getEntityServers(req.params.id as string);
    for (const s of servers) {
      if (s.role_id) {
        try {
          await deleteEntityRole(s.server_id, s.role_id);
        } catch {
          // Best effort
        }
      }
    }

    const deleted = registry.deleteEntity(req.params.id as string);
    if (!deleted) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }
    res.json({ success: true });
  });

  // PATCH /api/operator/entities/:id/owner — assign/change owner
  router.patch('/entities/:id/owner', (req: Request, res: Response) => {
    const { owner_id } = req.body;
    const updated = registry.setEntityOwner(req.params.id as string, owner_id || null);
    if (!updated) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }
    res.json({ success: true });
  });

  // POST /api/operator/entities/:id/add-server — directly add entity to server (bypass requests)
  router.post('/entities/:id/add-server', async (req: Request, res: Response) => {
    const entity = registry.getEntity(req.params.id as string);
    if (!entity) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }

    const { server_id, channels = [], tools = [], announce_channel } = req.body;
    if (!server_id) {
      res.status(400).json({ error: 'server_id required' });
      return;
    }

    registry.addServer(entity.id, server_id, channels, tools);

    // Create Discord role
    let roleId: string | null = null;
    try {
      roleId = await createEntityRole(server_id, entity.name);
      registry.updateServerRoleId(entity.id, server_id, roleId);
    } catch (err) {
      logger.warn(`Could not create role: ${err}`);
    }

    // Announce
    if (announce_channel && roleId) {
      try {
        await sendAnnouncement(announce_channel, entity.name, roleId, entity.platform, entity.owner_name);
      } catch (err) {
        logger.warn(`Announcement failed: ${err}`);
      }
    }

    res.json({ success: true, role_id: roleId });
  });

  // GET /api/operator/servers — all servers the bot is in
  router.get('/servers', (_req: Request, res: Response) => {
    const guilds = discordClient.guilds.cache.map(g => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
      member_count: g.memberCount,
    }));
    res.json(guilds);
  });

  return router;
}
