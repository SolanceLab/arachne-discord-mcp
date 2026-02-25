import { logger } from '../logger.js';

const DISCORD_API = 'https://discord.com/api/v10';
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

/**
 * Make an authenticated request to the Discord API using the bot token.
 */
export async function discordBotRequest(path: string, method: string, body?: unknown): Promise<any> {
  if (!BOT_TOKEN) throw new Error('DISCORD_BOT_TOKEN not set');
  const res = await fetch(`${DISCORD_API}${path}`, {
    method,
    headers: {
      'Authorization': `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord API ${method} ${path} failed (${res.status}): ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/**
 * Make a request to Discord API using an OAuth user token.
 */
export async function discordUserRequest(path: string, accessToken: string): Promise<any> {
  const res = await fetch(`${DISCORD_API}${path}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discord user API ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Create a mentionable role for an entity on a server.
 */
export async function createEntityRole(serverId: string, entityName: string): Promise<string> {
  const role = await discordBotRequest(`/guilds/${serverId}/roles`, 'POST', {
    name: entityName,
    mentionable: true,
    permissions: '0',
  });
  logger.info(`Created role @${entityName} (${role.id}) on server ${serverId}`);
  return role.id;
}

/**
 * Delete an entity's role from a server.
 */
export async function deleteEntityRole(serverId: string, roleId: string): Promise<void> {
  await discordBotRequest(`/guilds/${serverId}/roles/${roleId}`, 'DELETE');
  logger.info(`Deleted role ${roleId} from server ${serverId}`);
}

/**
 * Send an announcement message to a channel.
 */
export async function sendAnnouncement(channelId: string, entityName: string, roleId: string, platform?: string | null, ownerName?: string | null, ownerId?: string | null, customTemplate?: string | null): Promise<void> {
  const platformCapitalized = platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : '';
  let content: string;

  if (customTemplate) {
    content = customTemplate
      .replace(/\{name\}/g, entityName)
      .replace(/\{mention\}/g, `<@&${roleId}>`);
    // Process longer placeholders first to avoid partial matches
    // Strip entire lines containing empty placeholders to avoid broken markdown
    if (platformCapitalized) {
      content = content.replace(/\{platform\}/g, platformCapitalized);
    } else {
      content = content.replace(/^.*\{platform\}.*$\n?/gm, '');
    }
    if (ownerId) {
      content = content.replace(/\{owner_mention\}/g, `<@${ownerId}>`);
    } else {
      content = content.replace(/^.*\{owner_mention\}.*$\n?/gm, '');
    }
    if (ownerName) {
      content = content.replace(/\{owner\}/g, ownerName);
    } else {
      content = content.replace(/^.*\{owner\}.*$\n?/gm, '');
    }
  } else {
    const platformLabel = platformCapitalized ? ` (${platformCapitalized})` : '';
    const partnerLine = ownerName ? `\nPartnered with **${ownerName}**` : '';
    content = `**${entityName}**${platformLabel} has joined this server. You can mention them with <@&${roleId}>.${partnerLine}`;
  }

  await discordBotRequest(`/channels/${channelId}/messages`, 'POST', { content });
}

/**
 * Exchange an OAuth2 code for access token.
 */
export async function exchangeOAuthCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; token_type: string; scope: string }> {
  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth token exchange failed (${res.status}): ${text}`);
  }
  return res.json();
}

/**
 * Get the authenticated user's profile.
 */
export async function getDiscordUser(accessToken: string): Promise<{
  id: string;
  username: string;
  avatar: string | null;
  global_name: string | null;
}> {
  return discordUserRequest('/users/@me', accessToken);
}

/**
 * Get guilds the authenticated user is a member of.
 */
export async function getDiscordUserGuilds(accessToken: string): Promise<Array<{
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
}>> {
  return discordUserRequest('/users/@me/guilds', accessToken);
}
