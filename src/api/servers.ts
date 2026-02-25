import { Router } from 'express';
import type { Request, Response } from 'express';
import { ChannelType, type Client } from 'discord.js';
import { requireAuth, requireServerAdmin } from './middleware.js';
import { createEntityRole, deleteEntityRole, sendAnnouncement } from './discord-api.js';
import type { EntityRegistry } from '../entity-registry.js';
import { logger } from '../logger.js';

export function createServersRouter(registry: EntityRegistry, discordClient: Client): Router {
  const router = Router();

  router.use(requireAuth);

  // GET /api/servers/available — list all servers where bot is present (for server request picker)
  router.get('/available', (_req: Request, res: Response) => {
    const guilds = discordClient.guilds.cache.map(g => ({
      id: g.id,
      name: g.name,
      icon: g.icon,
    }));
    res.json(guilds);
  });

  // GET /api/servers/:id/channels — list all text channels, grouped by category
  router.get('/:id/channels', requireServerAdmin, (req: Request, res: Response) => {
    const guild = discordClient.guilds.cache.get(req.params.id as string);
    if (!guild) {
      res.status(404).json({ error: 'Server not found in cache' });
      return;
    }

    const textTypes = new Set([
      ChannelType.GuildText,
      ChannelType.GuildAnnouncement,
      ChannelType.GuildForum,
    ]);

    const channels = guild.channels.cache
      .filter(ch => textTypes.has(ch.type))
      .map(ch => ({
        id: ch.id,
        name: ch.name,
        type: ch.type,
        category_id: ch.parentId || null,
        category_name: ch.parent?.name || null,
        position: 'position' in ch ? (ch.position as number) : 0,
      }))
      .sort((a, b) => {
        // Sort by category name (null last), then position
        if (a.category_name !== b.category_name) {
          if (!a.category_name) return 1;
          if (!b.category_name) return -1;
          return a.category_name.localeCompare(b.category_name);
        }
        return a.position - b.position;
      });

    res.json(channels);
  });

  // GET /api/servers/:id/settings — server-level settings
  router.get('/:id/settings', requireServerAdmin, (req: Request, res: Response) => {
    const settings = registry.getServerSettings(req.params.id as string);
    res.json(settings);
  });

  // PATCH /api/servers/:id/settings — update server-level settings
  router.patch('/:id/settings', requireServerAdmin, (req: Request, res: Response) => {
    const { announce_channel, announce_message, default_template } = req.body;
    const updated = registry.updateServerSettings(req.params.id as string, {
      announce_channel,
      announce_message,
      default_template,
    });
    res.json(updated);
  });

  // GET /api/servers/:id/entities — list entities on this server
  router.get('/:id/entities', requireServerAdmin, (req: Request, res: Response) => {
    const entities = registry.getEntitiesForServer(req.params.id as string);
    res.json(entities.map(e => ({
      id: e.id,
      name: e.name,
      avatar_url: e.avatar_url,
      owner_id: e.owner_id,
      platform: e.platform,
      owner_name: e.owner_name,
      channels: JSON.parse(e.channels),
      tools: JSON.parse(e.tools),
      watch_channels: JSON.parse(e.watch_channels),
      blocked_channels: JSON.parse(e.blocked_channels),
      role_id: e.role_id,
    })));
  });

  // GET /api/servers/:id/requests — pending access requests
  router.get('/:id/requests', requireServerAdmin, (req: Request, res: Response) => {
    const status = (req.query.status as string) || 'pending';
    const requests = registry.getServerRequests(req.params.id as string, status);
    // Enrich with entity info + applicant name
    const result = requests.map(r => {
      const entity = registry.getEntity(r.entity_id);
      return {
        ...r,
        entity_name: entity?.name || 'Unknown',
        entity_avatar: entity?.avatar_url || null,
        entity_platform: entity?.platform || null,
        entity_owner_name: entity?.owner_name || null,
      };
    });
    res.json(result);
  });

  // POST /api/servers/:id/requests/:rid/approve — approve a request
  router.post('/:id/requests/:rid/approve', requireServerAdmin, async (req: Request, res: Response) => {
    const request = registry.getServerRequest(req.params.rid as string);
    if (!request || request.server_id !== (req.params.id as string)) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    if (request.status !== 'pending') {
      res.status(400).json({ error: `Request already ${request.status}` });
      return;
    }

    const { channels = [], tools = [] } = req.body;
    const entity = registry.getEntity(request.entity_id);
    if (!entity) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }

    try {
      // Add entity to server
      registry.addServer(request.entity_id, request.server_id, channels, tools);

      // Create Discord role
      let roleId: string | null = null;
      try {
        roleId = await createEntityRole(request.server_id, entity.name);
        registry.updateServerRoleId(request.entity_id, request.server_id, roleId);
      } catch (err) {
        logger.warn(`Could not create role: ${err}`);
      }

      // Send announcement using server settings
      const serverSettings = registry.getServerSettings(request.server_id);
      if (serverSettings.announce_channel && roleId) {
        try {
          await sendAnnouncement(serverSettings.announce_channel, entity.name, roleId, entity.platform, entity.owner_name, entity.owner_id, serverSettings.announce_message);
        } catch (err) {
          logger.warn(`Announcement failed: ${err}`);
        }
      }

      // Update request status
      registry.updateServerRequest(request.id, 'approved', req.user!.sub);

      res.json({ success: true, role_id: roleId });
    } catch (err) {
      res.status(500).json({ error: `Failed to approve: ${err instanceof Error ? err.message : String(err)}` });
    }
  });

  // POST /api/servers/:id/requests/:rid/reject — reject a request
  router.post('/:id/requests/:rid/reject', requireServerAdmin, (req: Request, res: Response) => {
    const request = registry.getServerRequest(req.params.rid as string);
    if (!request || request.server_id !== (req.params.id as string)) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    registry.updateServerRequest(request.id, 'rejected', req.user!.sub);
    res.json({ success: true });
  });

  // --- Role Templates ---

  // GET /api/servers/:id/templates — list templates for this server
  router.get('/:id/templates', requireServerAdmin, (req: Request, res: Response) => {
    const templates = registry.getServerTemplates(req.params.id as string);
    res.json(templates.map(t => ({
      ...t,
      channels: JSON.parse(t.channels),
      tools: JSON.parse(t.tools),
    })));
  });

  // POST /api/servers/:id/templates — create a new template
  router.post('/:id/templates', requireServerAdmin, (req: Request, res: Response) => {
    const { name, channels = [], tools = [] } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Template name is required' });
      return;
    }
    const template = registry.createServerTemplate(req.params.id as string, name.trim(), channels, tools);
    res.json({
      ...template,
      channels: JSON.parse(template.channels),
      tools: JSON.parse(template.tools),
    });
  });

  // PATCH /api/servers/:id/templates/:tid — update a template
  router.patch('/:id/templates/:tid', requireServerAdmin, (req: Request, res: Response) => {
    const template = registry.getServerTemplate(req.params.tid as string);
    if (!template || template.server_id !== (req.params.id as string)) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    const { name, channels, tools } = req.body;
    const updated = registry.updateServerTemplate(template.id, { name, channels, tools });
    res.json({
      ...updated!,
      channels: JSON.parse(updated!.channels),
      tools: JSON.parse(updated!.tools),
    });
  });

  // DELETE /api/servers/:id/templates/:tid — delete a template
  router.delete('/:id/templates/:tid', requireServerAdmin, (req: Request, res: Response) => {
    const template = registry.getServerTemplate(req.params.tid as string);
    if (!template || template.server_id !== (req.params.id as string)) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    registry.deleteServerTemplate(template.id);
    res.json({ success: true });
  });

  // PATCH /api/servers/:id/entities/:eid — update entity config on server
  router.patch('/:id/entities/:eid', requireServerAdmin, (req: Request, res: Response) => {
    const { channels, tools } = req.body;
    const updated = registry.updateEntityServerConfig(req.params.eid as string, req.params.id as string, channels, tools);
    if (!updated) {
      res.status(404).json({ error: 'Entity not on this server' });
      return;
    }
    res.json({ success: true });
  });

  // DELETE /api/servers/:id/entities/:eid — remove entity from server
  router.delete('/:id/entities/:eid', requireServerAdmin, async (req: Request, res: Response) => {
    const { removed, roleId } = registry.removeServer(req.params.eid as string, req.params.id as string);
    if (!removed) {
      res.status(404).json({ error: 'Entity not on this server' });
      return;
    }

    // Delete Discord role
    if (roleId) {
      try {
        await deleteEntityRole(req.params.id as string, roleId);
      } catch {
        // Best effort
      }
    }

    res.json({ success: true });
  });

  return router;
}
