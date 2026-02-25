import { Router } from 'express';
import type { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import type { Client } from 'discord.js';
import { requireAuth } from './middleware.js';
import type { EntityRegistry } from '../entity-registry.js';

const DATA_DIR = process.env.DATA_DIR || '/data';
const AVATAR_DIR = path.join(DATA_DIR, 'avatars');
const AVATAR_BASE_URL = process.env.AVATAR_BASE_URL || 'https://arachne-discord.fly.dev/avatars';

// Ensure avatar directory exists
fs.mkdirSync(AVATAR_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: AVATAR_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      // Will be renamed to entity ID after we know the entity
      cb(null, `tmp-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

export function createEntitiesRouter(registry: EntityRegistry, discordClient: Client): Router {
  const router = Router();

  // All routes require auth
  router.use(requireAuth);

  const MAX_ENTITIES_PER_USER = 5;

  // POST /api/entities — create entity (self-service)
  router.post('/', async (req: Request, res: Response) => {
    const { name, description, accent_color, platform } = req.body;
    if (!name || !name.trim()) {
      res.status(400).json({ error: 'name required' });
      return;
    }
    // Check per-user limit
    const owned = registry.getEntitiesByOwner(req.user!.sub);
    if (owned.length >= MAX_ENTITIES_PER_USER) {
      res.status(400).json({ error: `Entity limit reached (max ${MAX_ENTITIES_PER_USER})` });
      return;
    }
    const { entity, apiKey } = await registry.createEntity(name.trim(), undefined);
    registry.setEntityOwner(entity.id, req.user!.sub, req.user!.username);
    if (description || accent_color || platform) {
      registry.updateEntityIdentity(entity.id, {
        description: description?.trim() || undefined,
        accentColor: accent_color || undefined,
        platform: platform || undefined,
      });
    }
    res.json({
      id: entity.id,
      name: entity.name,
      description: description || null,
      accent_color: accent_color || null,
      platform: platform || null,
      owner_name: req.user!.username,
      avatar_url: entity.avatar_url,
      api_key: apiKey,
      mcp_url: `/mcp/${entity.id}`,
    });
  });

  // GET /api/entities — list entities owned by current user
  router.get('/', (req: Request, res: Response) => {
    const entities = registry.getEntitiesByOwner(req.user!.sub);
    const result = entities.map(e => ({
      id: e.id,
      name: e.name,
      description: e.description,
      avatar_url: e.avatar_url,
      accent_color: e.accent_color,
      platform: e.platform,
      owner_name: e.owner_name,
      created_at: e.created_at,
      servers: registry.getEntityServers(e.id).map(s => {
        const guild = discordClient.guilds.cache.get(s.server_id);
        return {
          server_id: s.server_id,
          server_name: guild?.name || s.server_id,
          channels: JSON.parse(s.channels),
          tools: JSON.parse(s.tools),
          watch_channels: JSON.parse(s.watch_channels),
          blocked_channels: JSON.parse(s.blocked_channels),
          role_id: s.role_id,
        };
      }),
    }));
    res.json(result);
  });

  // GET /api/entities/:id — get entity detail
  router.get('/:id', (req: Request, res: Response) => {
    const entity = registry.getEntity(req.params.id as string);
    if (!entity || !entity.active) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }
    // Must be owner or operator
    if (entity.owner_id !== req.user!.sub && !req.user!.is_operator) {
      res.status(403).json({ error: 'Not your entity' });
      return;
    }
    const servers = registry.getEntityServers(entity.id);
    res.json({
      id: entity.id,
      name: entity.name,
      description: entity.description,
      avatar_url: entity.avatar_url,
      accent_color: entity.accent_color,
      platform: entity.platform,
      owner_name: entity.owner_name,
      owner_id: entity.owner_id,
      created_at: entity.created_at,
      servers: servers.map(s => {
        const guild = discordClient.guilds.cache.get(s.server_id);
        return {
          server_id: s.server_id,
          server_name: guild?.name || s.server_id,
          channels: JSON.parse(s.channels),
          tools: JSON.parse(s.tools),
          watch_channels: JSON.parse(s.watch_channels),
          blocked_channels: JSON.parse(s.blocked_channels),
          role_id: s.role_id,
        };
      }),
    });
  });

  // PATCH /api/entities/:id — update name/avatar
  router.patch('/:id', (req: Request, res: Response) => {
    const entity = registry.getEntity(req.params.id as string);
    if (!entity || !entity.active) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }
    if (entity.owner_id !== req.user!.sub && !req.user!.is_operator) {
      res.status(403).json({ error: 'Not your entity' });
      return;
    }
    const { name, avatar_url, description, accent_color, platform } = req.body;
    registry.updateEntityIdentity(entity.id, { name, avatarUrl: avatar_url, description, accentColor: accent_color, platform });
    res.json({ success: true });
  });

  // POST /api/entities/:id/avatar — upload avatar image
  router.post('/:id/avatar', upload.single('avatar'), (req: Request, res: Response) => {
    const entity = registry.getEntity(req.params.id as string);
    if (!entity || !entity.active) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }
    if (entity.owner_id !== req.user!.sub && !req.user!.is_operator) {
      res.status(403).json({ error: 'Not your entity' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }

    // Rename temp file to entity ID
    const ext = path.extname(req.file.originalname) || '.png';
    const finalName = `${entity.id}${ext}`;
    const finalPath = path.join(AVATAR_DIR, finalName);

    // Remove old avatar if different extension
    try {
      for (const old of fs.readdirSync(AVATAR_DIR)) {
        if (old.startsWith(entity.id) && old !== finalName) {
          fs.unlinkSync(path.join(AVATAR_DIR, old));
        }
      }
    } catch { /* ignore */ }

    fs.renameSync(req.file.path, finalPath);

    const avatarUrl = `${AVATAR_BASE_URL}/${finalName}`;
    registry.updateEntityIdentity(entity.id, { avatarUrl });

    res.json({ avatar_url: avatarUrl });
  });

  // POST /api/entities/:id/regenerate-key — regenerate API key
  router.post('/:id/regenerate-key', async (req: Request, res: Response) => {
    const entity = registry.getEntity(req.params.id as string);
    if (!entity || !entity.active) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }
    if (entity.owner_id !== req.user!.sub && !req.user!.is_operator) {
      res.status(403).json({ error: 'Not your entity' });
      return;
    }
    const newKey = await registry.regenerateKey(entity.id);
    res.json({ api_key: newKey });
  });

  // PATCH /api/entities/:id/servers/:sid — entity owner fine-tunes watch/blocked channels
  router.patch('/:id/servers/:sid', (req: Request, res: Response) => {
    const entity = registry.getEntity(req.params.id as string);
    if (!entity || !entity.active) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }
    if (entity.owner_id !== req.user!.sub && !req.user!.is_operator) {
      res.status(403).json({ error: 'Not your entity' });
      return;
    }
    const { watch_channels, blocked_channels } = req.body;
    const updated = registry.updateEntityServerOwnerConfig(
      entity.id,
      req.params.sid as string,
      watch_channels,
      blocked_channels,
    );
    if (!updated) {
      res.status(404).json({ error: 'Entity not on this server' });
      return;
    }
    res.json({ success: true });
  });

  // POST /api/entities/:id/request-server — request access to a server
  router.post('/:id/request-server', (req: Request, res: Response) => {
    const entity = registry.getEntity(req.params.id as string);
    if (!entity || !entity.active) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }
    if (entity.owner_id !== req.user!.sub && !req.user!.is_operator) {
      res.status(403).json({ error: 'Not your entity' });
      return;
    }
    const { server_id } = req.body;
    if (!server_id) {
      res.status(400).json({ error: 'server_id required' });
      return;
    }
    const request = registry.createServerRequest(entity.id, server_id, req.user!.sub, req.user!.username);
    res.json(request);
  });

  return router;
}
