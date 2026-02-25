import { Router } from 'express';
import type { Request, Response } from 'express';
import type { Client } from 'discord.js';
import { exchangeOAuthCode, getDiscordUser, getDiscordUserGuilds } from './discord-api.js';
import { requireAuth, signJWT } from './middleware.js';
import type { EntityRegistry } from '../entity-registry.js';
import { logger } from '../logger.js';

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '1475773681329246259';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:5173';
const OPERATOR_IDS = (process.env.OPERATOR_DISCORD_IDS || '').split(',').filter(Boolean);

const ADMIN_PERMISSION = 0x8;        // ADMINISTRATOR
const MANAGE_GUILD_PERMISSION = 0x20; // MANAGE_GUILD

export function createAuthRouter(registry: EntityRegistry, discordClient: Client): Router {
  const router = Router();

  // GET /api/auth/discord-url — return the OAuth authorize URL
  router.get('/discord-url', (_req: Request, res: Response) => {
    const redirectUri = `${DASHBOARD_URL}/callback`;
    const params = new URLSearchParams({
      client_id: DISCORD_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify guilds',
    });
    res.json({ url: `https://discord.com/oauth2/authorize?${params}` });
  });

  // POST /api/auth/callback — exchange code for JWT
  router.post('/callback', async (req: Request, res: Response) => {
    const { code } = req.body;
    if (!code) {
      res.status(400).json({ error: 'Missing code' });
      return;
    }
    if (!DISCORD_CLIENT_SECRET) {
      res.status(500).json({ error: 'DISCORD_CLIENT_SECRET not configured' });
      return;
    }

    try {
      const redirectUri = `${DASHBOARD_URL}/callback`;

      // Exchange code for access token
      const tokenData = await exchangeOAuthCode(code, redirectUri, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET);

      // Fetch user info
      const user = await getDiscordUser(tokenData.access_token);

      // Fetch user's guilds
      const guilds = await getDiscordUserGuilds(tokenData.access_token);

      // Get bot's guild IDs
      const botGuildIds = new Set(discordClient.guilds.cache.map(g => g.id));

      // Filter to guilds where user is member AND bot is present
      const memberGuilds = guilds
        .filter(g => botGuildIds.has(g.id))
        .map(g => g.id);

      // Filter further to guilds where user is admin
      const adminGuilds = guilds
        .filter(g => {
          const perms = BigInt(g.permissions);
          return (perms & BigInt(ADMIN_PERMISSION)) !== 0n || (perms & BigInt(MANAGE_GUILD_PERMISSION)) !== 0n;
        })
        .filter(g => botGuildIds.has(g.id))
        .map(g => g.id);

      const isOperator = OPERATOR_IDS.includes(user.id);

      // Sign JWT
      const token = signJWT({
        sub: user.id,
        username: user.global_name || user.username,
        avatar: user.avatar,
        is_operator: isOperator,
        admin_guilds: adminGuilds,
        member_guilds: memberGuilds,
      });

      logger.info(`Dashboard login: ${user.username} (${user.id}) operator=${isOperator} admin_guilds=${adminGuilds.length} member_guilds=${memberGuilds.length}`);

      res.json({ token });
    } catch (err) {
      logger.error(`OAuth callback error: ${err}`);
      res.status(500).json({ error: 'Authentication failed' });
    }
  });

  // GET /api/auth/me — get current user profile + roles
  router.get('/me', requireAuth, (req: Request, res: Response) => {
    const user = req.user!;
    const ownedEntities = registry.getEntitiesByOwner(user.sub);

    // Get server names from Discord cache
    const adminServers = user.admin_guilds.map(guildId => {
      const guild = discordClient.guilds.cache.get(guildId);
      return {
        id: guildId,
        name: guild?.name || guildId,
        icon: guild?.icon || null,
      };
    });

    res.json({
      id: user.sub,
      username: user.username,
      avatar: user.avatar,
      is_operator: user.is_operator,
      admin_servers: adminServers,
      owned_entities: ownedEntities.map(e => ({
        id: e.id,
        name: e.name,
        avatar_url: e.avatar_url,
      })),
    });
  });

  return router;
}
